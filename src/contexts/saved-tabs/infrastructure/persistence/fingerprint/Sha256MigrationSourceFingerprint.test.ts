import { describe, expect, it } from 'vitest'

import { MIGRATION_SOURCE_KEYS } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

import { Sha256MigrationSourceFingerprint } from './Sha256MigrationSourceFingerprint'

const createSnapshot = (): RawLegacyStorageSnapshot =>
  Object.fromEntries(
    MIGRATION_SOURCE_KEYS.map((key) => [
      key,
      {
        status: 'present',
        value: key === 'activeAiChatConversationId' ? '' : [],
      },
    ]),
  ) as RawLegacyStorageSnapshot

describe('Sha256MigrationSourceFingerprint', () => {
  it('is stable across object property ordering and contains no raw content', async () => {
    const fingerprint = new Sha256MigrationSourceFingerprint()
    const first = {
      ...createSnapshot(),
      urls: {
        status: 'present' as const,
        value: [
          {
            id: 'private-id',
            title: 'private title',
            url: 'https://secret.example',
          },
        ],
      },
    }
    const second = {
      ...createSnapshot(),
      urls: {
        status: 'present' as const,
        value: [
          {
            url: 'https://secret.example',
            title: 'private title',
            id: 'private-id',
          },
        ],
      },
    }

    const firstValue = await fingerprint.create(first)
    const secondValue = await fingerprint.create(second)

    expect(firstValue).toBe(secondValue)
    expect(firstValue).toMatch(/^v1:[a-f0-9]{64}$/)
    expect(firstValue).not.toContain('secret.example')
    expect(firstValue).not.toContain('private title')
  })

  it('distinguishes missing, empty, and changed source values', async () => {
    const fingerprint = new Sha256MigrationSourceFingerprint()
    const empty = createSnapshot()
    const missing = { ...empty, urls: { status: 'missing' as const } }
    const changed = {
      ...empty,
      urls: { status: 'present' as const, value: [{ id: 'changed' }] },
    }

    const values = await Promise.all([
      fingerprint.create(empty),
      fingerprint.create(missing),
      fingerprint.create(changed),
    ])

    expect(new Set(values)).toHaveLength(3)
  })
})
