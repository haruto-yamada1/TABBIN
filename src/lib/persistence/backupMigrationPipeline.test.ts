import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  createBackupMigrationPipeline,
  defineBackupMigrationStep,
} from './backupMigrationPipeline'
import { BackupSchemaError } from './backupSchema'

const envelopeMetadataSchema = z.object({
  appVersion: z.string().min(1),
  exportedAt: z.iso.datetime(),
})

const backupV2Schema = envelopeMetadataSchema
  .extend({
    data: z.object({ name: z.string().min(1) }).strict(),
    schemaVersion: z.literal(2),
  })
  .strict()

const backupV3Schema = envelopeMetadataSchema
  .extend({
    data: z
      .object({
        collection: z.object({ name: z.string().min(1) }).strict(),
      })
      .strict(),
    schemaVersion: z.literal(3),
  })
  .strict()

const backupV4Schema = envelopeMetadataSchema
  .extend({
    data: z
      .object({
        collections: z.array(z.object({ name: z.string().min(1) }).strict()),
      })
      .strict(),
    schemaVersion: z.literal(4),
  })
  .strict()

type BackupV2 = z.output<typeof backupV2Schema>
type BackupV3 = z.output<typeof backupV3Schema>
type BackupV4 = z.output<typeof backupV4Schema>

const parseFixture = (filename: string): unknown => {
  const fixtureUrl = new URL(
    `__fixtures__/backup-schema/${filename}`,
    import.meta.url,
  )
  const parsed: unknown = JSON.parse(readFileSync(fixtureUrl, 'utf8'))
  return parsed
}

const backupV2 = parseFixture('backup-v2.json')
const backupV3 = parseFixture('backup-v3.json')
const backupCurrent = parseFixture('backup-current.json')
const backupFuture = parseFixture('backup-future.json')
const backupInvalid = parseFixture('backup-invalid.json')

const createTestPipeline = () => {
  const migrateV2ToV3 = vi.fn(
    (input: BackupV2): BackupV3 => ({
      appVersion: input.appVersion,
      data: { collection: { name: input.data.name } },
      exportedAt: input.exportedAt,
      schemaVersion: 3,
    }),
  )
  const migrateV3ToV4 = vi.fn(
    (input: BackupV3): BackupV4 => ({
      appVersion: input.appVersion,
      data: { collections: [input.data.collection] },
      exportedAt: input.exportedAt,
      schemaVersion: 4,
    }),
  )
  const v2ToV3 = defineBackupMigrationStep({
    fromVersion: 2,
    inputSchema: backupV2Schema,
    migrate: migrateV2ToV3,
    outputSchema: backupV3Schema,
    toVersion: 3,
  })
  const v3ToV4 = defineBackupMigrationStep({
    fromVersion: 3,
    inputSchema: backupV3Schema,
    migrate: migrateV3ToV4,
    outputSchema: backupV4Schema,
    toVersion: 4,
  })

  return {
    migrateV2ToV3,
    migrateV3ToV4,
    pipeline: createBackupMigrationPipeline({
      currentSchema: backupV4Schema,
      currentVersion: 4,
      migrations: new Map([
        [2, v2ToV3],
        [3, v3ToV4],
      ]),
    }),
    v2ToV3,
    v3ToV4,
  }
}

const captureSchemaError = (action: () => unknown): BackupSchemaError => {
  try {
    action()
  } catch (error) {
    if (error instanceof BackupSchemaError) {
      return error
    }
    throw error
  }
  throw new Error('A typed backup schema error must be thrown')
}

describe('createBackupMigrationPipeline', () => {
  it.each([0, 1.5])(
    'rejects invalid current schema version %s',
    (currentVersion) => {
      expect(() =>
        createBackupMigrationPipeline({
          currentSchema: backupV4Schema,
          currentVersion,
          migrations: new Map(),
        }),
      ).toThrow('Current backup schema version must be a positive integer')
    },
  )

  it('supports a current-only registry with no migrations', () => {
    const pipeline = createBackupMigrationPipeline({
      currentSchema: backupV4Schema,
      currentVersion: 4,
      migrations: new Map(),
    })

    expect(pipeline.migrateToCurrent(backupCurrent)).toEqual({
      backup: backupCurrent,
      kind: 'current',
      sourceVersion: 4,
    })
  })

  it('migrates V2 through every sequential step to the current schema', () => {
    const { migrateV2ToV3, migrateV3ToV4, pipeline } = createTestPipeline()

    expect(pipeline.migrateToCurrent(backupV2)).toEqual({
      backup: backupCurrent,
      kind: 'current',
      sourceVersion: 2,
    })
    expect(migrateV2ToV3).toHaveBeenCalledTimes(1)
    expect(migrateV3ToV4).toHaveBeenCalledTimes(1)
    expect(migrateV2ToV3.mock.invocationCallOrder[0]).toBeLessThan(
      migrateV3ToV4.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('starts from the declared supported version', () => {
    const { migrateV2ToV3, migrateV3ToV4, pipeline } = createTestPipeline()

    expect(pipeline.migrateToCurrent(backupV3)).toEqual({
      backup: backupCurrent,
      kind: 'current',
      sourceVersion: 3,
    })
    expect(migrateV2ToV3).not.toHaveBeenCalled()
    expect(migrateV3ToV4).toHaveBeenCalledTimes(1)
  })

  it('validates current input without invoking a migration', () => {
    const { migrateV2ToV3, migrateV3ToV4, pipeline } = createTestPipeline()

    expect(pipeline.migrateToCurrent(backupCurrent)).toEqual({
      backup: backupCurrent,
      kind: 'current',
      sourceVersion: 4,
    })
    expect(migrateV2ToV3).not.toHaveBeenCalled()
    expect(migrateV3ToV4).not.toHaveBeenCalled()
  })

  it('rejects invalid current-schema input without migration', () => {
    const { migrateV2ToV3, migrateV3ToV4, pipeline } = createTestPipeline()
    const invalidCurrent = {
      appVersion: '2.0.0',
      data: { collections: [{ name: '' }] },
      exportedAt: '2026-07-18T00:00:00.000Z',
      schemaVersion: 4,
    }

    expect(
      captureSchemaError(() => pipeline.migrateToCurrent(invalidCurrent)),
    ).toMatchObject({
      code: 'INVALID_SCHEMA',
      currentVersion: 4,
      receivedVersion: 4,
    })
    expect(migrateV2ToV3).not.toHaveBeenCalled()
    expect(migrateV3ToV4).not.toHaveBeenCalled()
  })

  it('rejects a future schema version with typed diagnostics', () => {
    const { pipeline } = createTestPipeline()

    expect(
      captureSchemaError(() => pipeline.migrateToCurrent(backupFuture)),
    ).toMatchObject({
      code: 'UNSUPPORTED_FUTURE_SCHEMA',
      currentVersion: 4,
      receivedVersion: 5,
    })
  })

  it('rejects an older schema outside the supported registry', () => {
    const { pipeline } = createTestPipeline()

    expect(
      captureSchemaError(() => pipeline.migrateToCurrent({ schemaVersion: 1 })),
    ).toMatchObject({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      currentVersion: 4,
      receivedVersion: 1,
    })
  })

  it('rejects invalid input before invoking its migration', () => {
    const { migrateV3ToV4, pipeline } = createTestPipeline()

    expect(
      captureSchemaError(() => pipeline.migrateToCurrent(backupInvalid)),
    ).toMatchObject({
      code: 'INVALID_SCHEMA',
      currentVersion: 4,
      receivedVersion: 3,
    })
    expect(migrateV3ToV4).not.toHaveBeenCalled()
  })

  it('rejects invalid migration output before the next step', () => {
    const { v3ToV4 } = createTestPipeline()
    const invalidOutput: BackupV3 = {
      appVersion: '2.0.0',
      data: { collection: { name: '' } },
      exportedAt: '2026-07-18T00:00:00.000Z',
      schemaVersion: 3,
    }
    const invalidV2ToV3 = defineBackupMigrationStep({
      fromVersion: 2,
      inputSchema: backupV2Schema,
      migrate: (): BackupV3 => invalidOutput,
      outputSchema: backupV3Schema,
      toVersion: 3,
    })
    const pipeline = createBackupMigrationPipeline({
      currentSchema: backupV4Schema,
      currentVersion: 4,
      migrations: new Map([
        [2, invalidV2ToV3],
        [3, v3ToV4],
      ]),
    })

    expect(
      captureSchemaError(() => pipeline.migrateToCurrent(backupV2)),
    ).toMatchObject({
      code: 'INVALID_SCHEMA',
      currentVersion: 4,
      receivedVersion: 2,
    })
  })

  it('rejects a gap in the supported sequential registry', () => {
    const { v2ToV3 } = createTestPipeline()

    expect(() =>
      createBackupMigrationPipeline({
        currentSchema: backupV4Schema,
        currentVersion: 4,
        migrations: new Map([[2, v2ToV3]]),
      }),
    ).toThrow('Missing backup migration step for schema version 3')
  })

  it('rejects a registry key that differs from its source version', () => {
    const { v2ToV3, v3ToV4 } = createTestPipeline()

    expect(() =>
      createBackupMigrationPipeline({
        currentSchema: backupV4Schema,
        currentVersion: 4,
        migrations: new Map([
          [1, v2ToV3],
          [3, v3ToV4],
        ]),
      }),
    ).toThrow('Backup migration registry key must match its source version')
  })

  it('rejects a migration that skips a schema version', () => {
    const { v3ToV4 } = createTestPipeline()
    const invalidStep = defineBackupMigrationStep({
      fromVersion: 2,
      inputSchema: backupV2Schema,
      migrate: () => backupCurrent,
      outputSchema: backupV4Schema,
      toVersion: 4,
    })

    expect(() =>
      createBackupMigrationPipeline({
        currentSchema: backupV4Schema,
        currentVersion: 4,
        migrations: new Map([
          [2, invalidStep],
          [3, v3ToV4],
        ]),
      }),
    ).toThrow('Backup migration steps must advance exactly one version')
  })

  it.each([
    { fromVersion: 0, toVersion: 1 },
    { fromVersion: 4, toVersion: 5 },
  ])(
    'rejects an out-of-range migration from $fromVersion to $toVersion',
    ({ fromVersion, toVersion }) => {
      const outOfRangeStep = defineBackupMigrationStep({
        fromVersion,
        inputSchema: backupV4Schema,
        migrate: (input): BackupV4 => input,
        outputSchema: backupV4Schema,
        toVersion,
      })

      expect(() =>
        createBackupMigrationPipeline({
          currentSchema: backupV4Schema,
          currentVersion: 4,
          migrations: new Map([[fromVersion, outOfRangeStep]]),
        }),
      ).toThrow(
        'Backup migration step must stay within the supported version range',
      )
    },
  )

  it('uses the validated registry snapshot after caller mutation', () => {
    const { migrateV2ToV3, migrateV3ToV4, v2ToV3, v3ToV4 } =
      createTestPipeline()
    const migrations = new Map([
      [2, v2ToV3],
      [3, v3ToV4],
    ])
    const pipeline = createBackupMigrationPipeline({
      currentSchema: backupV4Schema,
      currentVersion: 4,
      migrations,
    })
    const skippingStep = defineBackupMigrationStep({
      fromVersion: 2,
      inputSchema: backupV2Schema,
      migrate: (): BackupV4 => backupV4Schema.parse(backupCurrent),
      outputSchema: backupV4Schema,
      toVersion: 4,
    })

    migrations.set(2, skippingStep)
    migrations.delete(3)

    expect(pipeline.migrateToCurrent(backupV2)).toEqual({
      backup: backupCurrent,
      kind: 'current',
      sourceVersion: 2,
    })
    expect(migrateV2ToV3).toHaveBeenCalledTimes(1)
    expect(migrateV3ToV4).toHaveBeenCalledTimes(1)
  })

  it('validates the final value with the declared current schema', () => {
    const { v3ToV4 } = createTestPipeline()
    const narrowedCurrentSchema = backupV4Schema.refine(
      (backup) => backup.data.collections[0]?.name === 'Allowed',
    )
    const pipeline = createBackupMigrationPipeline({
      currentSchema: narrowedCurrentSchema,
      currentVersion: 4,
      migrations: new Map([[3, v3ToV4]]),
    })

    expect(
      captureSchemaError(() => pipeline.migrateToCurrent(backupV3)),
    ).toMatchObject({
      code: 'INVALID_SCHEMA',
      currentVersion: 4,
      receivedVersion: 3,
    })
  })

  it('returns the dedicated legacy classification without migration', () => {
    const { migrateV2ToV3, migrateV3ToV4, pipeline } = createTestPipeline()

    expect(pipeline.migrateToCurrent({ version: '2.0.0' })).toEqual({
      kind: 'legacy',
    })
    expect(migrateV2ToV3).not.toHaveBeenCalled()
    expect(migrateV3ToV4).not.toHaveBeenCalled()
  })
})
