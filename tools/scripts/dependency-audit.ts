import { createHash } from 'node:crypto'

import JSON5 from 'json5'
import { z } from 'zod'

// Explicitly reviewed for PR #1080. Renewal or dependency drift requires review;
// neither environment variables nor registry metadata can extend this interval.
const picomatchReview = {
  advisory: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
  reviewedAt: '2026-11-18T00:00:00Z',
  expiresAt: '2026-12-02T00:00:00Z',
  lockSha256:
    'cd77f2247c31d0b51d0e8ad4cc780e0f74013e646c5f0c0437701713523f2522',
} as const

const scopesSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
})
const advisorySchema = z.object({
  id: z.number().int().positive(),
  url: z
    .string()
    .regex(
      /^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/,
    ),
  title: z.string().min(1),
  severity: z.enum(['info', 'low', 'moderate', 'high', 'critical']),
  vulnerable_versions: z.string().min(1),
})
const reportSchema = z.record(
  z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/),
  z.array(advisorySchema).min(1),
)

const canonicalScope = (scope: Record<string, string> = {}) =>
  JSON.stringify(
    Object.entries(scope).toSorted(([a], [b]) => a.localeCompare(b)),
  )

function verifyReviewedContext(
  packageInput: unknown,
  lockContent: string,
  now: Date,
) {
  if (
    !Number.isFinite(now.getTime()) ||
    now.getTime() < Date.parse(picomatchReview.reviewedAt)
  ) {
    throw new Error('Invalid audit exception clock or future review')
  }
  if (now.getTime() >= Date.parse(picomatchReview.expiresAt)) {
    throw new Error(
      `picomatch audit exception expired at ${picomatchReview.expiresAt}`,
    )
  }
  if (
    createHash('sha256').update(lockContent).digest('hex') !==
    picomatchReview.lockSha256
  ) {
    throw new Error(
      'Reviewed picomatch dependency graph changed: bun.lock requires a new review',
    )
  }
  const manifest = scopesSchema.parse(packageInput)
  const lock = z
    .object({ workspaces: z.object({ '': scopesSchema }) })
    .parse(JSON5.parse<unknown>(lockContent))
  for (const scope of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const) {
    if (
      canonicalScope(manifest[scope]) !==
      canonicalScope(lock.workspaces[''][scope])
    ) {
      throw new Error(
        'Production dependency declarations differ from the reviewed lock',
      )
    }
  }
}

export function evaluateDependencyAudit(input: {
  stdout: string
  status: number | null
  packageInput: unknown
  lockContent: string
  now: Date
}) {
  if (input.status !== 0 && input.status !== 1) {
    throw new Error(
      `Dependency audit unavailable (exit ${String(input.status)})`,
    )
  }
  const report = reportSchema.parse(JSON.parse(input.stdout))
  const advisories = Object.entries(report).flatMap(([name, entries]) =>
    entries.map((entry) => ({ package: name, ...entry })),
  )
  if ((advisories.length === 0) !== (input.status === 0)) {
    throw new Error('Dependency audit report and exit status are inconsistent')
  }
  const accepted: { package: string; advisory: string; expiresAt: string }[] =
    []
  const blocking: typeof advisories = []
  for (const finding of advisories) {
    if (finding.severity !== 'high' && finding.severity !== 'critical') {
      continue
    }
    if (
      finding.package === 'picomatch' &&
      finding.url === picomatchReview.advisory &&
      finding.severity === 'high' &&
      finding.vulnerable_versions === '<=4.0.7'
    ) {
      verifyReviewedContext(input.packageInput, input.lockContent, input.now)
      accepted.push({
        package: finding.package,
        advisory: finding.url,
        expiresAt: picomatchReview.expiresAt,
      })
    } else {
      blocking.push(finding)
    }
  }
  return { advisories, accepted, blocking }
}
