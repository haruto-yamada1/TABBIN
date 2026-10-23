import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'

import JSON5 from 'json5'
import { satisfies, valid, validRange } from 'semver'
import { z } from 'zod'

// User-approved ordinary TABBIN product-code diagnostics only. The approved
// LICENSE bytes, purpose and review interval survive same-license upgrades.
export const reviewedLicensePolicy = {
  reviewedAt: '2026-10-21',
  expiresAt: '2026-11-20',
  owner: 'dependency maintenance / @haruto-yamada1',
  purpose: 'Ordinary TABBIN product code quality checks only',
  trackingPullRequest: 'https://github.com/haruto-yamada1/TABBIN/pull/978',
  license: 'SEE LICENSE IN LICENSE',
  sha256: 'aa9b278de35d20d320e40789db8b3e242096ed4a89c5aaf8fbe23a5e55c08ff1',
} as const

export const reviewedLicenseDependencies = [
  { name: 'react-doctor' },
  { name: 'oxlint-plugin-react-doctor' },
] as const

// Each version is checked separately, including nested resolutions.
export type LicenseContents = Readonly<Record<string, string>>

export const isReviewedLicenseDependency = (name: string): boolean =>
  reviewedLicenseDependencies.some((reviewed) => reviewed.name === name)

export function isNpmIntegrity(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  const match = /^sha(256|384|512)-([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match?.[1] || !match[2]) {
    return false
  }
  const digest = Buffer.from(match[2], 'base64')
  return (
    digest.length === Number(match[1]) / 8 &&
    digest.toString('base64') === match[2]
  )
}

const reviewedId = (id: string) => {
  const separator = id.lastIndexOf('@')
  const name = id.slice(0, separator)
  const version = id.slice(separator + 1)
  return isReviewedLicenseDependency(name) &&
    /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(version) &&
    valid(version) !== null
    ? { name, version }
    : undefined
}

const resolutionSchema = z.tuple([
  z.string(),
  z.enum(['', 'https://registry.npmjs.org']),
  z.record(z.string(), z.unknown()),
  z.custom<string>(isNpmIntegrity),
])

const reviewError = (detail: string): Error =>
  new Error(
    `React Doctor license review is invalid or expired: ${detail}; ${reviewedLicensePolicy.trackingPullRequest}`,
  )

// Include both package-key matches and references, so aliases and malformed
// name substitutions cannot hide a reviewed resolution from the guard.
export function reviewedLicenseResolutions(
  packages: Readonly<Record<string, unknown>>,
): Map<string, unknown[]> {
  const result = new Map<string, unknown[]>()
  for (const [key, value] of Object.entries(packages)) {
    const keyName = reviewedLicenseDependencies.find(
      ({ name }) => key === name || key.endsWith(`/${name}`),
    )?.name
    const reference: unknown = Array.isArray(value) ? value[0] : undefined
    const referenceName =
      typeof reference === 'string'
        ? reviewedLicenseDependencies.find(({ name }) =>
            reference.startsWith(`${name}@`),
          )?.name
        : undefined
    if (!keyName && !referenceName) {
      continue
    }
    const parsed = resolutionSchema.safeParse(value)
    const identity =
      typeof reference === 'string' ? reviewedId(reference) : undefined
    if (
      !parsed.success ||
      !identity ||
      (keyName && keyName !== identity.name)
    ) {
      throw reviewError(`malformed distribution: ${key}`)
    }
    const resolutions = result.get(parsed.data[0]) ?? []
    resolutions.push(value)
    result.set(parsed.data[0], resolutions)
  }
  return result
}

export function isReviewedLicense(
  id: string,
  license: string | undefined,
  resolutions: readonly unknown[],
  contents: LicenseContents,
  now = new Date(),
): boolean {
  const content = Object.hasOwn(contents, id) ? contents[id] : undefined
  const parsed = resolutions.map((entry) => resolutionSchema.safeParse(entry))
  return (
    reviewedId(id) !== undefined &&
    Number.isFinite(now.getTime()) &&
    now.getTime() >=
      Date.parse(`${reviewedLicensePolicy.reviewedAt}T00:00:00Z`) &&
    now.getTime() <
      Date.parse(`${reviewedLicensePolicy.expiresAt}T00:00:00Z`) &&
    license === reviewedLicensePolicy.license &&
    typeof content === 'string' &&
    createHash('sha256').update(content).digest('hex') ===
      reviewedLicensePolicy.sha256 &&
    parsed.length > 0 &&
    parsed.every(
      (entry) =>
        entry.success &&
        entry.data[0] === id &&
        entry.data[3] === (parsed[0]?.success ? parsed[0].data[3] : undefined),
    )
  )
}

const dependencyScopesSchema = z.object({
  dependencies: z.record(z.string(), z.unknown()).optional(),
  optionalDependencies: z.record(z.string(), z.unknown()).optional(),
})
const productionScopesSchema = dependencyScopesSchema.extend({
  peerDependencies: z.record(z.string(), z.unknown()).optional(),
})
const manifestSchema = productionScopesSchema.extend({
  devDependencies: z.object({
    'react-doctor': z.string().refine((range) => validRange(range) !== null),
  }),
})
const lockSchema = z.object({
  workspaces: z.object({ '': manifestSchema }).catchall(productionScopesSchema),
  packages: z.record(z.string(), z.unknown()),
})

const scopeReferences = (
  scope: Readonly<Record<string, unknown>> | undefined,
  name: string,
): boolean =>
  Object.entries(scope ?? {}).some(
    ([dependency, reference]) =>
      dependency === name ||
      (typeof reference === 'string' &&
        (reference === `npm:${name}` || reference.startsWith(`npm:${name}@`))),
  )

const doctorRequiresPlugin = (
  resolutions: ReadonlyMap<string, readonly unknown[]>,
): boolean =>
  [...resolutions].some(
    ([id, entries]) =>
      id.startsWith('react-doctor@') &&
      entries.some((entry) => {
        const metadata = dependencyScopesSchema.parse(
          resolutionSchema.parse(entry)[2],
        )
        return [metadata.dependencies, metadata.optionalDependencies].some(
          (scope) => scopeReferences(scope, 'oxlint-plugin-react-doctor'),
        )
      }),
  )

// GitHub's PURL exclusion ignores versions. This mandatory guard checks every
// current lock resolution and the corresponding installed LICENSE bytes.
export function verifyDependencyLicensePolicy(
  packageInput: unknown,
  lockInput: unknown,
  contents: LicenseContents,
  now = new Date(),
): void {
  const manifest = manifestSchema.parse(packageInput)
  const lock = lockSchema.parse(lockInput)
  const range = manifest.devDependencies['react-doctor']
  const rootDoctor = resolutionSchema.safeParse(lock.packages['react-doctor'])
  if (
    range !== lock.workspaces[''].devDependencies['react-doctor'] ||
    !rootDoctor.success ||
    !rootDoctor.data[0].startsWith('react-doctor@') ||
    !satisfies(rootDoctor.data[0].slice('react-doctor@'.length), range)
  ) {
    throw reviewError('root react-doctor declaration/resolution mismatch')
  }
  const resolutions = reviewedLicenseResolutions(lock.packages)
  const pluginRequired = doctorRequiresPlugin(resolutions)
  for (const { name } of reviewedLicenseDependencies) {
    if (
      [manifest, ...Object.values(lock.workspaces)].some((workspace) =>
        [
          workspace.dependencies,
          workspace.optionalDependencies,
          workspace.peerDependencies,
        ].some((scope) => scopeReferences(scope, name)),
      ) ||
      ((name === 'react-doctor' || pluginRequired) &&
        ![...resolutions.keys()].some((id) => reviewedId(id)?.name === name))
    ) {
      throw reviewError(name)
    }
  }
  for (const [id, entries] of resolutions) {
    if (
      !isReviewedLicense(
        id,
        reviewedLicensePolicy.license,
        entries,
        contents,
        now,
      )
    ) {
      throw reviewError(id)
    }
  }
}

const readInstalledReviewedLicense = (
  packageRoot: string,
  name: string,
  entry: string,
  expected: ReadonlyMap<string, readonly unknown[]>,
): readonly [string, string] => {
  if (
    !lstatSync(packageRoot).isDirectory() ||
    realpathSync(packageRoot) !== packageRoot
  ) {
    throw reviewError(`noncanonical installed root: ${name}`)
  }
  const metadata = z
    .object({
      name: z.literal(name),
      version: z.string(),
      license: z.literal(reviewedLicensePolicy.license),
    })
    .parse(
      JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')),
    )
  const id = `${metadata.name}@${metadata.version}`
  if (
    !reviewedId(id) ||
    !expected.has(id) ||
    (entry !== id && !entry.startsWith(`${id}+`))
  ) {
    throw reviewError(`installed identity: ${id}`)
  }
  const file = path.join(packageRoot, 'LICENSE')
  if (!lstatSync(file).isFile()) {
    throw reviewError(`LICENSE must be a regular file: ${id}`)
  }
  const content = readFileSync(file, 'utf8')
  if (
    createHash('sha256').update(content).digest('hex') !==
    reviewedLicensePolicy.sha256
  ) {
    throw reviewError(`installed LICENSE: ${id}`)
  }
  return [id, content]
}

// Read package-root manifests directly: neither reviewed package exports a
// public package.json subpath, and Bun installs the plugin in its own store.
// Frozen installation supplies tarball integrity offline; npm identity and
// exact dist.integrity are independently checked by the online review.
export function readReviewedLicenseContents(
  lockInput?: unknown,
  root = process.cwd(),
): LicenseContents {
  const directory = realpathSync(root)
  const lock = lockSchema.parse(
    lockInput ??
      JSON5.parse<unknown>(
        readFileSync(path.join(directory, 'bun.lock'), 'utf8'),
      ),
  )
  const expected = reviewedLicenseResolutions(lock.packages)
  const store = path.join(directory, 'node_modules/.bun')
  const contents: Record<string, string> = {}
  const installed = new Map<string, string>()
  for (const entry of readdirSync(store).toSorted()) {
    const name = reviewedLicenseDependencies.find((reviewed) =>
      entry.startsWith(`${reviewed.name}@`),
    )?.name
    if (!name) {
      continue
    }
    const packageRoot = path.join(store, entry, 'node_modules', name)
    const [id, content] = readInstalledReviewedLicense(
      packageRoot,
      name,
      entry,
      expected,
    )
    contents[id] = content
    installed.set(packageRoot, id)
  }
  for (const id of expected.keys()) {
    if (!Object.hasOwn(contents, id)) {
      throw reviewError(`missing installed LICENSE: ${id}`)
    }
  }
  const doctorRoot = realpathSync(
    path.join(directory, 'node_modules/react-doctor'),
  )
  const direct = resolutionSchema.parse(lock.packages['react-doctor'])[0]
  if (installed.get(doctorRoot) !== direct) {
    throw reviewError('direct installed react-doctor identity')
  }
  return contents
}
