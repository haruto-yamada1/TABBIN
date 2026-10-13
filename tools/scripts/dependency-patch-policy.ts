import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

// Reviewed upstream #6247 compatibility addition. These fingerprints authorize
// this exact addition, never edits/deletions of existing patches or scan skips.
export const reviewedPatchAdditions = [
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
  const resolutions = Object.values(head.packages).filter(
    (value) => Array.isArray(value) && value[0] === reviewed.dependency,
  )
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
        (value[1] !== '' && value[1] !== 'https://registry.npmjs.org') ||
        !isRecord(value[2]) ||
        value[3] !== reviewed.integrity
      )
    })
  ) {
    rejectPatchChange()
  }
}

export function verifyReviewedPatchAdditions(
  base: PatchSnapshot,
  head: PatchSnapshot,
  contents: PatchContents,
): string[] {
  const before = readPatchMap(base.patchedDependencies)
  const after = readPatchMap(head.patchedDependencies)
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
