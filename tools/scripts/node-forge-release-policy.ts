// Reviewed npm artifact for Issue #1067. Version changes require a new review;
// changing policy metadata alone cannot authorize a different resolution.
// Keep this module dependency-free: patch policy also runs before installation.
export const reviewedNodeForgeRelease = {
  version: '1.4.3',
  source: 'npm:node-forge@1.4.3',
  integrity:
    'sha512-P6wzfh6t70avmV8FrVEAd/36sOPJQ+hkaJVX1Laap9J/77m7M0eyozDvc8SwnDf4P7MP94gwbAAo0rg3YVXT+g==',
} as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null)

const hasApprovedVersion = (value: unknown): boolean =>
  isRecord(value) && value['node-forge'] === reviewedNodeForgeRelease.version

function rejectBinding(): never {
  throw new Error('node-forge npm release binding is not approved')
}

function verifyPatchMap(input: unknown): void {
  if (input === undefined) {
    return
  }
  if (!isRecord(input)) {
    rejectBinding()
  }
  for (const [key, file] of Object.entries(input)) {
    if (
      typeof file !== 'string' ||
      key === 'node-forge' ||
      key.startsWith('node-forge@') ||
      file === 'patches/node-forge-null-parameters.patch'
    ) {
      throw new Error('node-forge npm release must not retain a backport patch')
    }
  }
}

function isForgeResolution([key, entry]: [string, unknown]): boolean {
  return (
    key === 'node-forge' ||
    (key.endsWith('/node-forge') && !key.split('/').at(-2)?.startsWith('@')) ||
    (Array.isArray(entry) &&
      typeof entry[0] === 'string' &&
      (entry[0].startsWith('node-forge@') ||
        entry[0].toLowerCase().includes('digitalbazaar/forge')))
  )
}

function isApprovedResolution(entry: unknown): boolean {
  return (
    Array.isArray(entry) &&
    entry.length === 4 &&
    entry[0] === 'node-forge@1.4.3' &&
    (entry[1] === '' || entry[1] === 'https://registry.npmjs.org') &&
    isRecord(entry[2]) &&
    Object.keys(entry[2]).length === 0 &&
    entry[3] === reviewedNodeForgeRelease.integrity
  )
}

function verifyLockBinding(snapshot: Record<string, unknown>): void {
  const workspace = isRecord(snapshot.workspaces) && snapshot.workspaces['']
  if (
    !isRecord(snapshot.packages) ||
    !isRecord(workspace) ||
    !hasApprovedVersion(workspace.devDependencies) ||
    (snapshot.lockfileVersion !== undefined && snapshot.lockfileVersion !== 1)
  ) {
    rejectBinding()
  }
  const resolutions = Object.entries(snapshot.packages).filter(
    isForgeResolution,
  )
  if (resolutions.length === 0) {
    throw new Error('node-forge npm release lock binding is missing')
  }
  for (const [key, entry] of resolutions) {
    if (!isApprovedResolution(entry)) {
      throw new Error(
        `node-forge npm release lock binding is not approved: ${key}`,
      )
    }
  }
}

export function verifyNodeForgeReleaseBinding(snapshot: unknown): void {
  if (!isRecord(snapshot) || !hasApprovedVersion(snapshot.overrides)) {
    rejectBinding()
  }
  const isLock =
    'packages' in snapshot ||
    isRecord(snapshot.workspaces) ||
    'lockfileVersion' in snapshot
  if (isLock) {
    verifyLockBinding(snapshot)
  } else if (!hasApprovedVersion(snapshot.devDependencies)) {
    rejectBinding()
  }
  verifyPatchMap(snapshot.patchedDependencies)
}
