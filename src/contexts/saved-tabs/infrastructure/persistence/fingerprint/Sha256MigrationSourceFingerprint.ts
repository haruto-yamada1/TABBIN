import type { MigrationSourceFingerprintPort } from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  if (value === undefined) {
    return { $type: 'undefined' }
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $type: 'non-finite-number', value: String(value) }
  }
  return value
}

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)]
    .map((value) => value.toString(HEX_RADIX).padStart(2, '0'))
    .join('')

const HEX_RADIX = 16

export class Sha256MigrationSourceFingerprint implements MigrationSourceFingerprintPort {
  readonly create = async (
    source: RawLegacyStorageSnapshot,
  ): Promise<string> => {
    const serialized = JSON.stringify(canonicalize(source))
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(serialized),
    )
    return `v1:${toHex(digest)}`
  }
}
