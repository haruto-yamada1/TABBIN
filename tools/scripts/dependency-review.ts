import JSON5 from 'json5'
import { z } from 'zod'

import {
  isNpmIntegrity,
  isReviewedLicense,
  isReviewedLicenseDependency,
  reviewedLicenseResolutions,
} from './dependency-license-policy'
import type { LicenseContents } from './dependency-license-policy'
import {
  reviewedNodeForgeBackport,
  verifyReviewedPatchAdditions,
} from './dependency-patch-policy'
import type { PatchContents } from './dependency-patch-policy'
import { extractNameAndVersion } from './generate-release-provenance'

// Composite expressions require explicit review; no package-wide exceptions.
export const allowedLicenses = [
  '0BSD',
  'Apache-2.0',
  'Artistic-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'BSL-1.0',
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  'OFL-1.1',
  'Python-2.0',
  'Unlicense',
  'Zlib',
]

// Explicitly reviewed conjunctions and DOMPurify's Apache-2.0 distribution
// choice. Do not infer acceptance of other SPDX expressions or MPL-only use.
const allowedLicenseExpressions = new Set([
  'Apache-2.0 AND MIT',
  'MIT AND ISC',
  '(MPL-2.0 OR Apache-2.0)',
])

const lockSchema = z.object({
  lockfileVersion: z.literal(1),
  workspaces: z.record(z.string(), z.unknown()),
  packages: z.record(z.string(), z.unknown()),
  patchedDependencies: z.record(z.string(), z.unknown()).optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
})
const advisoriesSchema = z.array(
  z.object({
    ghsa_id: z.string(),
    severity: z.enum(['unknown', 'low', 'medium', 'high', 'critical']),
    withdrawn_at: z.string().nullable(),
  }),
)
const packageSchema = z.object({
  name: z.string(),
  version: z.string(),
  license: z.union([z.string(), z.object({ type: z.string() })]).optional(),
  dist: z.unknown().optional(),
})

const npmEntrySchema = z.tuple([
  z.string(),
  z.enum(['', 'https://registry.npmjs.org']),
  z.record(z.string(), z.unknown()),
  z.string().regex(/^sha(?:256|384|512)-/),
])

type Dependency = { name: string; version: string; fingerprint: string }
export type ReviewRequest = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

const readLock = (content: string) =>
  lockSchema.parse(JSON5.parse<unknown>(content))

const dependencies = (
  lock: ReturnType<typeof readLock>,
): Map<string, Dependency> => {
  const result = new Map<string, Dependency>()
  for (const [key, value] of Object.entries(lock.packages)) {
    const parsed = z.array(z.unknown()).safeParse(value)
    const reference = parsed.success ? parsed.data[0] : undefined
    if (!parsed.success || typeof reference !== 'string') {
      throw new TypeError(`Malformed lock entry: ${key}`)
    }
    const raw = parsed.data
    const { name, version } = extractNameAndVersion(reference)
    if (version.startsWith('workspace:')) {
      const workspace = lock.workspaces[version.slice('workspace:'.length)]
      if (
        raw.length !== 1 ||
        !z.object({ name: z.literal(name) }).safeParse(workspace).success
      ) {
        throw new Error(`Unknown workspace: ${key}`)
      }
      continue
    }
    // The existing patched snapshot is verified by security:audit, not npm
    // version matching. Any source/integrity change requires a new decision.
    if (
      raw[0] === reviewedNodeForgeBackport.dependency &&
      JSON.stringify(raw) ===
        JSON.stringify(reviewedNodeForgeBackport.resolution) &&
      lock.patchedDependencies?.[reviewedNodeForgeBackport.dependency] ===
        reviewedNodeForgeBackport.path
    ) {
      continue
    }
    if (
      !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(version) ||
      !/^(?:@[a-z\d._-]+\/)?[a-z\d._-]+$/.test(name) ||
      !npmEntrySchema.safeParse(raw).success
    ) {
      throw new Error(`Unsupported or malformed dependency: ${key}`)
    }
    // Preserve distinct nested resolutions and same-version integrity changes.
    result.set(key, { name, version, fingerprint: JSON.stringify(raw) })
  }
  return result
}

const getJson = async (
  url: string,
  request: ReviewRequest,
): Promise<unknown> => {
  const response = await request(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(
      `Dependency review service returned HTTP ${response.status}`,
    )
  }
  if (response.headers.get('link')?.includes('rel="next"')) {
    throw new Error('Incomplete advisory response: pagination requires review')
  }
  return response.json()
}

export const reviewDependencyChanges = async (
  baseContent: string,
  headContent: string,
  request: ReviewRequest = fetch,
  patchContents: PatchContents = {},
  licenseContents: LicenseContents = {},
  now = new Date(),
): Promise<{ dependencies: string[]; findings: string[] }> => {
  const base = readLock(baseContent)
  const head = readLock(headContent)
  const newlyPatched = verifyReviewedPatchAdditions(base, head, patchContents)
  const previous = dependencies(base)
  const current = dependencies(head)
  const reviewedResolutions = reviewedLicenseResolutions(head.packages)
  const changed = [...current].filter(
    ([key, entry]) => previous.get(key)?.fingerprint !== entry.fingerprint,
  )
  const added = [
    ...new Set([
      ...changed.map(([, entry]) => `${entry.name}@${entry.version}`),
      ...newlyPatched.filter(
        (id) => id !== reviewedNodeForgeBackport.dependency,
      ),
    ]),
  ].toSorted()
  // The Graph action excludes these package names irrespective of version.
  // Recheck all their current resolutions even when base/head are identical.
  const reviewIds = [
    ...new Set([...added, ...reviewedResolutions.keys()]),
  ].toSorted()
  // Batch the public Advisory API instead of making one request per package.
  const batches = Array.from(
    { length: Math.ceil(reviewIds.length / 25) },
    (_, index) => reviewIds.slice(index * 25, index * 25 + 25),
  )
  const advisoryFindings = await batches.reduce(async (previous, batch) => {
    const findings = await previous
    const query = new URLSearchParams({
      ecosystem: 'npm',
      affects: batch.join(','),
      is_withdrawn: 'false',
      per_page: '100',
    })
    const advisories = advisoriesSchema.parse(
      await getJson(`https://api.github.com/advisories?${query}`, request),
    )
    for (const advisory of advisories) {
      if (
        advisory.withdrawn_at === null &&
        ['high', 'critical', 'unknown'].includes(advisory.severity)
      ) {
        findings.push(`${advisory.severity}: ${advisory.ghsa_id}`)
      }
    }
    return findings
  }, Promise.resolve<string[]>([]))
  // Sequence requests to keep npm/GitHub secondary rate limits bounded.
  const licenseFindings = await reviewIds.reduce(async (previous, id) => {
    const findings = await previous
    const { name, version } = extractNameAndVersion(id)
    const metadata = packageSchema.parse(
      await getJson(
        `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
        request,
      ),
    )
    if (metadata.name !== name || metadata.version !== version) {
      throw new Error(`Registry identity mismatch: ${id}`)
    }
    const license =
      typeof metadata.license === 'string'
        ? metadata.license
        : metadata.license?.type
    const reviewed = isReviewedLicenseDependency(name)
    const resolutions = reviewedResolutions.get(id) ?? []
    if (reviewed) {
      const distribution = z
        .object({ integrity: z.custom<string>(isNpmIntegrity) })
        .safeParse(metadata.dist)
      if (
        !distribution.success ||
        !resolutions.length ||
        resolutions.some(
          (entry) =>
            !Array.isArray(entry) || entry[3] !== distribution.data.integrity,
        )
      ) {
        throw new Error(`Registry distribution integrity mismatch: ${id}`)
      }
    }
    const accepted = reviewed
      ? isReviewedLicense(id, license, resolutions, licenseContents, now)
      : license !== undefined &&
        (allowedLicenses.includes(license) ||
          allowedLicenseExpressions.has(license))
    if (!accepted) {
      findings.push(`license: ${id}: ${license ?? 'UNKNOWN'}`)
    }
    return findings
  }, Promise.resolve<string[]>([]))
  return {
    dependencies: added,
    findings: [...new Set([...advisoryFindings, ...licenseFindings])],
  }
}
