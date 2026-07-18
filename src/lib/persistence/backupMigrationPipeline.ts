import type { z } from 'zod'

import { BackupSchemaError, detectBackupFormat } from './backupSchema'

export type BackupMigration<TFrom, TTo> = (input: TFrom) => TTo

type BackupMigrationStepResult =
  | { readonly data: unknown; readonly success: true }
  | { readonly success: false }

export type BackupMigrationStep = {
  readonly execute: (input: unknown) => BackupMigrationStepResult
  readonly fromVersion: number
  readonly toVersion: number
}

type DefineBackupMigrationStepOptions<TFrom, TTo> = {
  readonly fromVersion: number
  readonly inputSchema: z.ZodType<TFrom>
  readonly migrate: BackupMigration<TFrom, TTo>
  readonly outputSchema: z.ZodType<TTo>
  readonly toVersion: number
}

export const defineBackupMigrationStep = <TFrom, TTo>({
  fromVersion,
  inputSchema,
  migrate,
  outputSchema,
  toVersion,
}: DefineBackupMigrationStepOptions<TFrom, TTo>): BackupMigrationStep => ({
  execute: (input) => {
    const parsedInput = inputSchema.safeParse(input)
    if (!parsedInput.success) {
      return { success: false }
    }

    const migrated = migrate(parsedInput.data)
    const parsedOutput = outputSchema.safeParse(migrated)
    return parsedOutput.success
      ? { data: parsedOutput.data, success: true }
      : { success: false }
  },
  fromVersion,
  toVersion,
})

export type BackupMigrationResult<TCurrent> =
  | { readonly kind: 'legacy' }
  | {
      readonly backup: TCurrent
      readonly kind: 'current'
      readonly sourceVersion: number
    }

type CreateBackupMigrationPipelineOptions<TCurrent> = {
  readonly currentSchema: z.ZodType<TCurrent>
  readonly currentVersion: number
  readonly migrations: ReadonlyMap<number, BackupMigrationStep>
}

type BackupMigrationPipeline<TCurrent> = {
  readonly migrateToCurrent: (input: unknown) => BackupMigrationResult<TCurrent>
}

const assertValidRegistry = (
  currentVersion: number,
  migrations: ReadonlyMap<number, BackupMigrationStep>,
): readonly BackupMigrationStep[] => {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    throw new TypeError(
      'Current backup schema version must be a positive integer',
    )
  }

  if (migrations.size === 0) {
    return []
  }

  const sortedEntries = [...migrations.entries()].toSorted(
    ([leftVersion], [rightVersion]) => leftVersion - rightVersion,
  )

  for (const [registeredVersion, step] of sortedEntries) {
    if (registeredVersion !== step.fromVersion) {
      throw new TypeError(
        'Backup migration registry key must match its source version',
      )
    }
    if (step.toVersion !== step.fromVersion + 1) {
      throw new TypeError(
        'Backup migration steps must advance exactly one version',
      )
    }
    if (step.fromVersion < 1 || step.toVersion > currentVersion) {
      throw new TypeError(
        'Backup migration step must stay within the supported version range',
      )
    }
  }

  const firstEntry = sortedEntries[0]
  const [minimumVersion] = firstEntry
  for (let version = minimumVersion; version < currentVersion; version += 1) {
    if (!migrations.has(version)) {
      throw new TypeError(
        `Missing backup migration step for schema version ${version}`,
      )
    }
  }

  return sortedEntries.map(([, step]) => step)
}

const invalidSchemaError = (
  currentVersion: number,
  receivedVersion: number,
): BackupSchemaError =>
  new BackupSchemaError('INVALID_SCHEMA', {
    currentVersion,
    receivedVersion,
  })

export const createBackupMigrationPipeline = <TCurrent>({
  currentSchema,
  currentVersion,
  migrations,
}: CreateBackupMigrationPipelineOptions<TCurrent>): BackupMigrationPipeline<TCurrent> => {
  const migrationRegistry = new Map(migrations)
  const migrationSteps = assertValidRegistry(currentVersion, migrationRegistry)

  return {
    migrateToCurrent: (input) => {
      const format = detectBackupFormat(input)
      if (format.kind === 'legacy') {
        return { kind: 'legacy' }
      }

      const sourceVersion = format.schemaVersion
      if (sourceVersion > currentVersion) {
        throw new BackupSchemaError('UNSUPPORTED_FUTURE_SCHEMA', {
          currentVersion,
          receivedVersion: sourceVersion,
        })
      }

      if (sourceVersion === currentVersion) {
        const currentResult = currentSchema.safeParse(input)
        if (!currentResult.success) {
          throw invalidSchemaError(currentVersion, sourceVersion)
        }
        return {
          backup: currentResult.data,
          kind: 'current',
          sourceVersion,
        }
      }

      if (!migrationRegistry.has(sourceVersion)) {
        throw new BackupSchemaError('UNSUPPORTED_SCHEMA_VERSION', {
          currentVersion,
          receivedVersion: sourceVersion,
        })
      }

      let migrated: unknown = input
      for (const step of migrationSteps) {
        if (step.fromVersion < sourceVersion) {
          continue
        }

        const result = step.execute(migrated)
        if (!result.success) {
          throw invalidSchemaError(currentVersion, sourceVersion)
        }
        migrated = result.data
      }

      const currentResult = currentSchema.safeParse(migrated)
      if (!currentResult.success) {
        throw invalidSchemaError(currentVersion, sourceVersion)
      }

      return {
        backup: currentResult.data,
        kind: 'current',
        sourceVersion,
      }
    },
  }
}
