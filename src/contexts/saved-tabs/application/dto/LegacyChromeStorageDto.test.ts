import { describe, expect, it } from 'vitest'

import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

import { parseLegacyChromeStorage } from './LegacyChromeStorageDto'

const emptySource = (): RawLegacyStorageSnapshot =>
  Object.fromEntries(
    MIGRATION_SOURCE_KEYS.map((key) => [
      key,
      {
        status: 'present',
        value: key === 'activeAiChatConversationId' ? '' : [],
      },
    ]),
  ) as RawLegacyStorageSnapshot

describe('parseLegacyChromeStorage', () => {
  it('keeps the raw source immutable and returns a dedicated legacy DTO', () => {
    const source = emptySource()
    const before = structuredClone(source)

    const result = parseLegacyChromeStorage(source)

    expect(result.dto.urls).toEqual([])
    expect(result.dto.activeAiChatConversationId).toBe('')
    expect(result.issues).toEqual([])
    expect(source).toEqual(before)
  })

  it('distinguishes a missing key from a present value with an invalid type', () => {
    const source: RawLegacyStorageSnapshot = {
      ...emptySource(),
      savedTabs: { status: 'missing' },
      urls: { status: 'present', value: undefined },
    }

    const result = parseLegacyChromeStorage(source)

    expect(result.dto.savedTabs).toEqual([])
    expect(result.dto.urls).toEqual([])
    expect(result.issues).toEqual([
      {
        code: 'MIGRATION_SOURCE_MISSING_KEY',
        key: 'savedTabs',
        severity: 'warning',
      },
      {
        code: 'MIGRATION_SOURCE_INVALID_TYPE',
        key: 'urls',
        severity: 'error',
      },
    ])
  })
})
