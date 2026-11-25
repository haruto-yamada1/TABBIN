import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { unzipSync } from 'fflate'

import { readPersistenceReleaseArtifact } from './verify-persistence-release-compatibility'

type JsonObject = Record<string, unknown>

export type PublishedBrowserArtifact = {
  readonly extensionId: string
  readonly prodversion: string
  readonly sha256: string
  readonly status: 'published'
  readonly version: string
}

export type ExcludedBrowserArtifact = {
  readonly followUp?: string
  readonly reason: string
  readonly status: 'excluded'
}

export type BrowserArtifactPin =
  | ExcludedBrowserArtifact
  | PublishedBrowserArtifact

export type PublishedArtifactManifest = {
  readonly chrome: BrowserArtifactPin
  readonly firefox: BrowserArtifactPin
  readonly schemaVersion: 1
}

export type PublishedArtifactBrowser = 'chrome' | 'firefox'

export type ResolvedPublishedArtifact =
  | {
      readonly browser: PublishedArtifactBrowser
      readonly followUp?: string
      readonly reason: string
      readonly status: 'excluded'
    }
  | {
      readonly browser: PublishedArtifactBrowser
      readonly directory: string
      readonly label: string
      readonly sha256: string
      readonly status: 'published'
      readonly url: string
      readonly version: string
    }

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: JsonObject, keys: readonly string[]): boolean => {
  const expected = new Set(keys)
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key))
  )
}

const VERSION_PATTERN = /^\d+(?:\.\d+){0,3}$/u
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u

const decodePublishedBrowserArtifact = (
  value: unknown,
): PublishedBrowserArtifact => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'extensionId',
      'prodversion',
      'sha256',
      'status',
      'version',
    ]) ||
    value.status !== 'published' ||
    typeof value.version !== 'string' ||
    !VERSION_PATTERN.test(value.version) ||
    typeof value.extensionId !== 'string' ||
    !EXTENSION_ID_PATTERN.test(value.extensionId) ||
    typeof value.prodversion !== 'string' ||
    !VERSION_PATTERN.test(value.prodversion) ||
    typeof value.sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.sha256)
  ) {
    throw new TypeError('Published browser artifact metadata is invalid.')
  }
  return {
    extensionId: value.extensionId,
    prodversion: value.prodversion,
    sha256: value.sha256,
    status: 'published',
    version: value.version,
  }
}

const decodeExcludedBrowserArtifact = (
  value: unknown,
): ExcludedBrowserArtifact => {
  if (
    !isRecord(value) ||
    (value.followUp !== undefined && typeof value.followUp !== 'string') ||
    !hasOnlyKeys(
      value,
      value.followUp === undefined
        ? ['reason', 'status']
        : ['followUp', 'reason', 'status'],
    ) ||
    value.status !== 'excluded' ||
    typeof value.reason !== 'string' ||
    value.reason.trim() === '' ||
    (typeof value.followUp === 'string' && value.followUp.trim() === '')
  ) {
    throw new TypeError('Excluded browser artifact metadata is invalid.')
  }
  return {
    ...(typeof value.followUp === 'string' ? { followUp: value.followUp } : {}),
    reason: value.reason,
    status: 'excluded',
  }
}

const decodeBrowserArtifactPin = (value: unknown): BrowserArtifactPin => {
  if (!isRecord(value)) {
    throw new TypeError('Browser artifact pin is invalid.')
  }
  if (value.status === 'published') {
    return decodePublishedBrowserArtifact(value)
  }
  if (value.status === 'excluded') {
    return decodeExcludedBrowserArtifact(value)
  }
  throw new TypeError('Browser artifact pin status is invalid.')
}

export const decodePublishedArtifactManifest = (
  value: unknown,
): PublishedArtifactManifest => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['chrome', 'firefox', 'schemaVersion']) ||
    value.schemaVersion !== 1
  ) {
    throw new TypeError('Published artifact manifest is invalid.')
  }
  return {
    chrome: decodeBrowserArtifactPin(value.chrome),
    firefox: decodeBrowserArtifactPin(value.firefox),
    schemaVersion: 1,
  }
}

export const buildChromeWebStoreUrl = (
  artifact: PublishedBrowserArtifact,
): string =>
  `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(artifact.prodversion)}&acceptformat=crx2,crx3&x=${encodeURIComponent(`id=${artifact.extensionId}&uc`)}`

export const verifyArtifactChecksum = ({
  bytes,
  expectedSha256,
  label,
}: {
  readonly bytes: Uint8Array
  readonly expectedSha256: string
  readonly label: string
}): string => {
  const actualSha256 = createHash('sha256').update(bytes).digest('hex')
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Published artifact checksum mismatch for ${label}: expected ${expectedSha256}, got ${actualSha256}.`,
    )
  }
  return actualSha256
}

const ZIP_LOCAL_FILE_MAGIC = new TextEncoder().encode('PK\u0003\u0004')

export const extractCrxPayload = (bytes: Uint8Array): Uint8Array => {
  if (
    bytes.length < 16 ||
    new TextDecoder().decode(bytes.subarray(0, 4)) !== 'Cr24'
  ) {
    throw new Error('Invalid CRX header: missing Cr24 magic.')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  let payloadOffset: number
  if (version === 3) {
    payloadOffset = 12 + view.getUint32(8, true)
  } else if (version === 2) {
    payloadOffset = 16 + view.getUint32(8, true) + view.getUint32(12, true)
  } else {
    throw new Error(`Unsupported CRX version: ${version}.`)
  }
  if (payloadOffset < 16 || payloadOffset + 4 > bytes.length) {
    throw new Error('Invalid CRX header length.')
  }
  const payload = bytes.subarray(payloadOffset)
  if (!ZIP_LOCAL_FILE_MAGIC.every((byte, index) => payload[index] === byte)) {
    throw new Error('CRX payload is not a ZIP archive.')
  }
  return payload
}

const assertSafeArchivePath = (entryPath: string): void => {
  if (
    entryPath === '' ||
    entryPath.includes('\\') ||
    entryPath.includes('\0') ||
    entryPath.startsWith('/') ||
    /^[A-Za-z]:/u.test(entryPath) ||
    entryPath.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error(`Unsafe ZIP path: ${entryPath}`)
  }
}

export const extractZipToDirectory = ({
  bytes,
  directory,
}: {
  readonly bytes: Uint8Array
  readonly directory: string
}): string[] => {
  const root = path.resolve(directory)
  rmSync(root, { force: true, recursive: true })
  mkdirSync(root, { recursive: true })
  const files = unzipSync(bytes)
  for (const [entryPath, content] of Object.entries(files)) {
    assertSafeArchivePath(entryPath)
    const target = path.resolve(root, entryPath)
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Unsafe ZIP path: ${entryPath}`)
    }
    if (entryPath.endsWith('/')) {
      if (content.length > 0) {
        throw new Error(`Nonempty ZIP directory: ${entryPath}`)
      }
      mkdirSync(target, { recursive: true })
      continue
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return Object.keys(files)
    .filter((entryPath) => !entryPath.endsWith('/'))
    .toSorted((left, right) => left.localeCompare(right, 'en'))
}

export const resolvePublishedArtifact = async ({
  browser,
  fetchImpl = globalThis.fetch,
  manifest,
  outputDirectory,
}: {
  readonly browser: PublishedArtifactBrowser
  readonly fetchImpl?: typeof fetch
  readonly manifest: PublishedArtifactManifest
  readonly outputDirectory: string
}): Promise<ResolvedPublishedArtifact> => {
  const pin = manifest[browser]
  if (pin.status === 'excluded') {
    return {
      browser,
      ...(pin.followUp === undefined ? {} : { followUp: pin.followUp }),
      reason: pin.reason,
      status: 'excluded',
    }
  }

  const url = buildChromeWebStoreUrl(pin)
  const label = `${browser}-web-store@${pin.version}`
  let bytes: Uint8Array
  try {
    const response = await fetchImpl(url, { redirect: 'follow' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    throw new Error(
      `Published artifact download failed for ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    )
  }

  const sha256 = verifyArtifactChecksum({
    bytes,
    expectedSha256: pin.sha256,
    label,
  })
  const directory = path.join(
    outputDirectory,
    `${browser}-web-store-${pin.version}-${sha256.slice(0, 12)}`,
  )
  extractZipToDirectory({
    bytes: extractCrxPayload(bytes),
    directory,
  })

  let artifact
  try {
    artifact = readPersistenceReleaseArtifact(directory)
  } catch (error) {
    throw new Error(
      `Published artifact metadata is invalid for ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    )
  }
  if (artifact.appVersion !== pin.version) {
    throw new Error(
      `Published artifact version mismatch for ${label}: expected ${pin.version}, found ${artifact.appVersion}.`,
    )
  }

  return {
    browser,
    directory,
    label,
    sha256,
    status: 'published',
    url,
    version: pin.version,
  }
}
