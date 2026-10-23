import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

export const reviewedNodeForgeBackport = {
  dependency: 'node-forge@github:digitalbazaar/forge#ceba344',
  path: 'patches/node-forge-null-parameters.patch',
  sha256: '66b0a5fbdb250c8faa4c2df38f3921bc39942e45491ad081bd452b906b067721',
  source: 'github:digitalbazaar/forge#ceba34402e329f0365134f23fe19898756527d65',
  resolution: [
    'node-forge@github:digitalbazaar/forge#ceba344',
    {},
    'digitalbazaar-forge-ceba344',
    'sha512-wQzUb9EXQPFuPFkcj/4B6mxSxkAbkRTgCJ7xEH61S0uBcaeUy3x0y7ppyHDW8xMGwsvkxgMzPaJH0hgWZHs4cQ==',
  ],
} as const

// Reviewed Git backport and upstream #6247 compatibility addition. These
// fingerprints authorize exact additions, never patch edits/deletions or skips.
export const reviewedPatchAdditions = [
  reviewedNodeForgeBackport,
  {
    dependency: '@stryker-mutator/vitest-runner@10.0.0',
    path: 'patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch',
    sha256: 'a3746c65765a05acad23706324ac687eb4650a7b946d10040fd7c6c68d1742f8',
    integrity:
      'sha512-SHK2/vfvRUpiz7jXPnQMBnr6zLdm69DK03Mo5mPhaZWcRSygrKUqYsPqWsXsK+5ySHzlMTfCyFK5NQ/X9sJFFw==',
  },
] as const

type PatchSnapshot = {
  packages: Readonly<Record<string, unknown>>
  patchedDependencies?: Readonly<Record<string, unknown>> | undefined
  workspaces?: unknown
  overrides?: unknown
}

export type PatchContents = Readonly<Record<string, string>>
type ReviewedPatch = (typeof reviewedPatchAdditions)[number]

const rejectPatchChange = (): never => {
  throw new Error('Dependency patch changes require a security review')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null)

export function readPatchSnapshot(value: unknown): PatchSnapshot {
  if (
    !isRecord(value) ||
    !isRecord(value.packages) ||
    (value.patchedDependencies !== undefined &&
      !isRecord(value.patchedDependencies))
  ) {
    throw new Error('Malformed dependency patch snapshot')
  }
  return {
    packages: value.packages,
    patchedDependencies: value.patchedDependencies,
    workspaces: value.workspaces,
    overrides: value.overrides,
  }
}

function readPatchMap(
  value: PatchSnapshot['patchedDependencies'],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, path] of Object.entries(value ?? {})) {
    if (typeof path !== 'string') {
      return rejectPatchChange()
    }
    Object.defineProperty(result, key, { enumerable: true, value: path })
  }
  return result
}

export const readReviewedPatchContents = (): PatchContents =>
  Object.fromEntries(
    reviewedPatchAdditions
      .filter(({ path }) => existsSync(path))
      .map(({ path }) => [path, readFileSync(path, 'utf8')]),
  )

function verifyReviewedPatchBinding(
  head: PatchSnapshot,
  reviewed: ReviewedPatch,
  contents: PatchContents,
): void {
  const bytes = contents[reviewed.path]
  const resolutions = Object.entries(head.packages)
    .filter(([key, value]) =>
      'resolution' in reviewed
        ? key === 'node-forge' ||
          (key.endsWith('/node-forge') &&
            !key.split('/').at(-2)?.startsWith('@')) ||
          (Array.isArray(value) &&
            typeof value[0] === 'string' &&
            value[0].startsWith('node-forge@'))
        : Array.isArray(value) && value[0] === reviewed.dependency,
    )
    .map(([, value]) => value)
  if (
    head.patchedDependencies?.[reviewed.dependency] !== reviewed.path ||
    bytes === undefined ||
    createHash('sha256').update(bytes).digest('hex') !== reviewed.sha256 ||
    resolutions.length === 0 ||
    resolutions.some((value) => {
      return (
        !Array.isArray(value) ||
        value.length !== 4 ||
        value[0] !== reviewed.dependency ||
        ('resolution' in reviewed
          ? !isRecord(value[1]) ||
            Object.keys(value[1]).length !== 0 ||
            value[2] !== reviewed.resolution[2] ||
            value[3] !== reviewed.resolution[3]
          : (value[1] !== '' && value[1] !== 'https://registry.npmjs.org') ||
            !isRecord(value[2]) ||
            value[3] !== reviewed.integrity)
      )
    })
  ) {
    rejectPatchChange()
  }
  if ('resolution' in reviewed) {
    const workspace = isRecord(head.workspaces) && head.workspaces['']
    const dependencies = isRecord(workspace) && workspace.devDependencies
    if (
      !isRecord(dependencies) ||
      dependencies['node-forge'] !== reviewed.source ||
      !isRecord(head.overrides) ||
      head.overrides['node-forge'] !== reviewed.source
    ) {
      rejectPatchChange()
    }
  }
}

function usesReviewedNodeForgeBackport(
  head: PatchSnapshot,
  contents: PatchContents,
): boolean {
  const forge = reviewedNodeForgeBackport
  const workspace = isRecord(head.workspaces) && head.workspaces['']
  const dependencies = isRecord(workspace) && workspace.devDependencies
  return (
    contents[forge.path] !== undefined ||
    (isRecord(dependencies) && dependencies['node-forge'] === forge.source) ||
    (isRecord(head.overrides) &&
      head.overrides['node-forge'] === forge.source) ||
    Object.values(head.packages).some(
      (entry) => Array.isArray(entry) && entry[0] === forge.dependency,
    )
  )
}

export function verifyReviewedPatchAdditions(
  base: PatchSnapshot,
  head: PatchSnapshot,
  contents: PatchContents,
): string[] {
  const before = readPatchMap(base.patchedDependencies)
  const after = readPatchMap(head.patchedDependencies)
  if (
    !Object.hasOwn(after, reviewedNodeForgeBackport.dependency) &&
    usesReviewedNodeForgeBackport(head, contents)
  ) {
    rejectPatchChange()
  }
  const added: string[] = []
  for (const dependency of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ])) {
    if (before[dependency] !== after[dependency]) {
      const reviewed = reviewedPatchAdditions.find(
        (item) => item.dependency === dependency,
      )
      if (
        before[dependency] !== undefined ||
        after[dependency] !== reviewed?.path
      ) {
        rejectPatchChange()
      }
      if (!reviewed) {
        rejectPatchChange()
      }
      added.push(dependency)
    }
  }
  for (const reviewed of reviewedPatchAdditions) {
    if (Object.hasOwn(after, reviewed.dependency)) {
      verifyReviewedPatchBinding(head, reviewed, contents)
    }
  }
  return added.toSorted()
}
