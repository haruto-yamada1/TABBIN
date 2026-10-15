import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { BackupSchemaError } from '@/lib/persistence/backupSchema'

import { inspectBackupV2 } from './BackupV2Inspector'

const readFixture = (name: string): string =>
  readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')

const createOlderBackupV2 = () => {
  const { data, preview } = inspectBackupV2(
    readFixture('backup-v2-current.json'),
  )

  return {
    appVersion: preview.appVersion,
    data: {
      ...data,
      savedTabs: {
        categories: [],
        collections: [
          {
            createdAt: 1,
            definition: { domain: 'example.test', type: 'domain' },
            id: 'collection-1',
            name: 'Example',
            sortOrder: 1024,
            updatedAt: 1,
          },
        ],
        groups: [],
        memberships: [
          {
            addedAt: 1,
            collectionId: 'collection-1',
            sortOrder: 1024,
            updatedAt: 1,
            urlId: 'url-1',
          },
        ],
        urls: [
          {
            firstSavedAt: 1,
            id: 'url-1',
            lastSavedAt: 1,
            normalizedUrl: 'https://example.test/',
            title: 'Example',
            updatedAt: 1,
            url: 'https://example.test/',
          },
        ],
      },
    },
    exportedAt: preview.exportedAt,
    schemaVersion: 2,
  }
}

describe('inspectBackupV2', () => {
  it('strictly validates the current V2 fixture', () => {
    expect(
      inspectBackupV2(readFixture('backup-v2-current.json')),
    ).toMatchObject({
      preview: {
        schemaVersion: 2,
      },
    })
  })

  it('rejects a future schema with safe version diagnostics', () => {
    expect(() => inspectBackupV2(readFixture('backup-v2-future.json'))).toThrow(
      expect.objectContaining<Partial<BackupSchemaError>>({
        code: 'UNSUPPORTED_FUTURE_SCHEMA',
        currentVersion: 2,
        receivedVersion: 3,
      }),
    )
  })

  it('rejects invalid JSON without leaking parser details', () => {
    expect(() => inspectBackupV2('{not-json')).toThrow(
      expect.objectContaining<Partial<BackupSchemaError>>({
        code: 'INVALID_SCHEMA',
      }),
    )
  })

  it('rejects schema-less backups without a legacy inspection branch', () => {
    expect(() => inspectBackupV2({ version: '1.0.0' })).toThrow(
      expect.objectContaining<Partial<BackupSchemaError>>({
        code: 'UNSUPPORTED_LEGACY_BACKUP',
      }),
    )
  })

  it('preserves older V2 records without inventing optional metadata', () => {
    const backup = createOlderBackupV2()

    const inspection = inspectBackupV2(JSON.stringify(backup))

    expect(inspection.data).toStrictEqual(backup.data)
    expect(inspection.preview.entityCounts).toMatchObject({
      collections: 1,
      memberships: 1,
      urls: 1,
    })
  })

  it.each(['1', '2026-07-28T00:00:00.000Z', null])(
    'rejects a nonnumeric timestamp %s in an older V2 backup',
    (timestamp) => {
      const backup = createOlderBackupV2()
      const url = backup.data.savedTabs.urls[0]
      if (url === undefined) {
        throw new Error('Missing timestamp test URL')
      }
      Object.assign(url, { firstSavedAt: timestamp })
      const originalBackup = structuredClone(backup)

      expect(() => inspectBackupV2(JSON.stringify(backup))).toThrow(
        expect.objectContaining<Partial<BackupSchemaError>>({
          code: 'INVALID_SCHEMA',
        }),
      )
      expect(backup).toStrictEqual(originalBackup)
    },
  )
})
