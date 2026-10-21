import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'

import { unzipSync } from 'fflate'

type Entry = {
  path: string
  timestamp: number
  metadata: string
  localTimestamp: number
  localMetadata: string
  crc32: number
  uncompressedBytes: number
}

const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

const findEndRecord = (view: DataView, length: number) => {
  for (
    let offset = length - 22;
    offset >= Math.max(0, length - 65557);
    offset--
  ) {
    if (
      view.getUint32(offset, true) === 101010256 /* PK end record */ &&
      offset + 22 + view.getUint16(offset + 20, true) === length
    ) {
      return offset
    }
  }
  throw new Error('Invalid ZIP end record')
}

const validateEntry = (
  name: string,
  names: Set<string>,
  view: DataView,
  offset: number,
) => {
  const segments = name.replace(/\/$/u, '').split('/')
  if (
    !name ||
    name.includes('\\') ||
    name.includes('\0') ||
    segments.some((segment) => ['', '.', '..'].includes(segment)) ||
    /^[A-Za-z]:/u.test(name)
  ) {
    throw new Error(`Unsafe ZIP path: ${name}`)
  }
  if (names.has(name)) {
    throw new Error(`Duplicate ZIP entry: ${name}`)
  }
  names.add(name)
  if (
    (view.getUint16(offset + 8, true) & 1) !== 0 ||
    ((view.getUint32(offset + 38, true) >>> 16) & 61440) === 40960
  ) {
    throw new Error(`Unsupported ZIP encrypted/symlink entry: ${name}`)
  }
}

const readLocalHeader = (
  bytes: Uint8Array,
  view: DataView,
  central: number,
  directoryStart: number,
  name: string,
) => {
  const offset = view.getUint32(central + 42, true)
  if (
    offset + 30 > directoryStart ||
    view.getUint32(offset, true) !== 67324752 /* PK local entry */
  ) {
    throw new Error(`Invalid ZIP local header: ${name}`)
  }
  const nameLength = view.getUint16(offset + 26, true)
  const extraLength = view.getUint16(offset + 28, true)
  const dataStart = offset + 30 + nameLength + extraLength
  const localName = new TextDecoder('utf-8', { fatal: true }).decode(
    bytes.subarray(offset + 30, offset + 30 + nameLength),
  )
  if (
    dataStart + view.getUint32(central + 20, true) > directoryStart ||
    localName !== name ||
    view.getUint32(offset + 6, true) !== view.getUint32(central + 8, true)
  ) {
    throw new Error(`Inconsistent ZIP local/central header: ${name}`)
  }
  // Data-descriptor entries defer these fields to the central directory.
  if ((view.getUint16(offset + 6, true) & 8) === 0) {
    for (const [localField, centralField] of [
      [14, 16],
      [18, 20],
      [22, 24],
    ] as const) {
      if (
        view.getUint32(offset + localField, true) !==
        view.getUint32(central + centralField, true)
      ) {
        throw new Error(
          `Inconsistent ZIP local/central CRC or size header: ${name}`,
        )
      }
    }
  }
  return {
    localTimestamp: view.getUint32(offset + 10, true),
    localMetadata: sha256(bytes.subarray(offset + 30 + nameLength, dataStart)),
  }
}

// Read the central directory before unzipSync, which collapses duplicate names.
// No files are extracted to disk and no archive metadata is normalized.
const readEntries = (bytes: Uint8Array): Entry[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = findEndRecord(view, bytes.length)
  const count = view.getUint16(end + 10, true)
  const directoryStart = view.getUint32(end + 16, true)
  let offset = directoryStart
  if (
    view.getUint32(end + 4, true) !== 0 ||
    view.getUint16(end + 8, true) !== count ||
    count === 65535 ||
    offset + view.getUint32(end + 12, true) !== end
  ) {
    throw new Error('Unsupported ZIP directory (multi-disk or ZIP64)')
  }
  const names = new Set<string>()
  const entries: Entry[] = []
  for (let index = 0; index < count; index++) {
    if (
      offset + 46 > end ||
      view.getUint32(offset, true) !== 33639248 /* PK central entry */
    ) {
      throw new Error('Invalid ZIP central directory')
    }
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const next = offset + 46 + nameLength + extraLength + commentLength
    if (next > end) {
      throw new Error('Invalid ZIP entry length')
    }
    const name = new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    )
    validateEntry(name, names, view, offset)
    entries.push({
      path: name,
      ...readLocalHeader(bytes, view, offset, directoryStart, name),
      crc32: view.getUint32(offset + 16, true),
      uncompressedBytes: view.getUint32(offset + 24, true),
      timestamp: view.getUint32(offset + 12, true),
      metadata: JSON.stringify([
        view.getUint32(offset + 4, true),
        view.getUint32(offset + 8, true),
        view.getUint32(offset + 20, true),
        view.getUint32(offset + 34, true),
        view.getUint32(offset + 38, true),
        sha256(bytes.subarray(offset + 46 + nameLength, next)),
      ]),
    })
    offset = next
  }
  if (offset !== end) {
    throw new Error('Invalid ZIP directory size')
  }
  return entries
}

const inspectZip = (bytes: Uint8Array) => {
  const entries = readEntries(bytes)
  const contents = unzipSync(bytes)
  for (const entry of entries) {
    const content = contents[entry.path]
    if (
      !content ||
      content.length !== entry.uncompressedBytes ||
      crc32(content) !== entry.crc32
    ) {
      throw new Error(`Invalid ZIP content CRC or size: ${entry.path}`)
    }
    if (entry.path.endsWith('/') && content.length !== 0) {
      throw new Error(`Nonempty ZIP directory: ${entry.path}`)
    }
  }
  const manifestBytes = contents['manifest.json']
  if (!manifestBytes) {
    throw new Error('Missing manifest.json in ZIP')
  }
  const manifest: unknown = JSON.parse(new TextDecoder().decode(manifestBytes))
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Invalid manifest.json in ZIP')
  }
  const files = entries
    .filter((entry) => !entry.path.endsWith('/'))
    .map((entry) => {
      const content = contents[entry.path]
      if (!content) {
        throw new Error(`Missing ZIP content: ${entry.path}`)
      }
      return {
        path: entry.path,
        bytes: content.length,
        sha256: sha256(content),
      }
    })
    .toSorted((left, right) => left.path.localeCompare(right.path, 'en'))
  return {
    sha256: sha256(bytes),
    bytes: bytes.length,
    entries,
    files,
    manifest,
  }
}

export const compareBuildZips = (
  leftBytes: Uint8Array,
  rightBytes: Uint8Array,
) => {
  const left = inspectZip(leftBytes)
  const right = inspectZip(rightBytes)
  const leftFiles = new Map(left.files.map((file) => [file.path, file.sha256]))
  const rightFiles = new Map(
    right.files.map((file) => [file.path, file.sha256]),
  )
  const added = right.files
    .filter((file) => !leftFiles.has(file.path))
    .map((file) => file.path)
  const removed = left.files
    .filter((file) => !rightFiles.has(file.path))
    .map((file) => file.path)
  const changed = left.files
    .filter(
      (file) =>
        rightFiles.has(file.path) && rightFiles.get(file.path) !== file.sha256,
    )
    .map((file) => file.path)
  const rightEntries = new Map(
    right.entries.map((entry) => [entry.path, entry]),
  )
  const metadataChanges = left.entries.flatMap((entry) => {
    const other = rightEntries.get(entry.path)
    if (!other) {
      return []
    }
    return [
      ...(entry.timestamp !== other.timestamp
        ? [`${entry.path}: timestamp`]
        : []),
      ...(entry.localTimestamp !== other.localTimestamp
        ? [`${entry.path}: local timestamp`]
        : []),
      ...(entry.localMetadata !== other.localMetadata
        ? [`${entry.path}: local metadata`]
        : []),
      ...(entry.metadata !== other.metadata
        ? [`${entry.path}: metadata/compression`]
        : []),
    ]
  })
  return {
    zipEqual: left.sha256 === right.sha256,
    contentEqual: added.length + removed.length + changed.length === 0,
    added,
    removed,
    changed,
    entryOrderEqual:
      JSON.stringify(left.entries.map((entry) => entry.path)) ===
      JSON.stringify(right.entries.map((entry) => entry.path)),
    metadataChanges,
    left,
    right,
  }
}
