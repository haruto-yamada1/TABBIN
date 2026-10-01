import { BackupSchemaError } from '@/lib/persistence/backupSchema'

import { inspectBackupV2 } from './v2/BackupV2Inspector'
import type { BackupV2Inspection } from './v2/BackupV2Inspector'

export const PRODUCTION_BACKUP_IMPORT_ERROR_CODES = [
  'UNSUPPORTED_LEGACY_BACKUP',
  'UNSUPPORTED_FUTURE_SCHEMA',
  'INVALID_BACKUP',
] as const

export type ProductionBackupImportErrorCode =
  (typeof PRODUCTION_BACKUP_IMPORT_ERROR_CODES)[number]

const PRODUCTION_BACKUP_IMPORT_ERROR_MESSAGES: Readonly<
  Record<ProductionBackupImportErrorCode, string>
> = {
  INVALID_BACKUP: 'Backup is invalid',
  UNSUPPORTED_FUTURE_SCHEMA: 'Backup schema is newer than supported',
  UNSUPPORTED_LEGACY_BACKUP: 'Legacy backup format is unsupported',
}

export class ProductionBackupImportError extends Error {
  readonly code: ProductionBackupImportErrorCode
  readonly currentVersion: number | undefined
  readonly receivedVersion: number | undefined

  constructor(
    code: ProductionBackupImportErrorCode,
    versions: {
      readonly currentVersion?: number | undefined
      readonly receivedVersion?: number | undefined
    } = {},
  ) {
    super(PRODUCTION_BACKUP_IMPORT_ERROR_MESSAGES[code])
    this.name = 'ProductionBackupImportError'
    this.code = code
    this.currentVersion = versions.currentVersion
    this.receivedVersion = versions.receivedVersion
  }
}

export type ProductionImportGateResult = {
  readonly inspection: BackupV2Inspection
  readonly kind: 'v2-overwrite'
}

const parseJson = (input: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(input)
    return parsed
  } catch {
    throw new ProductionBackupImportError('INVALID_BACKUP')
  }
}

const normalizeSchemaError = (
  error: BackupSchemaError,
): ProductionBackupImportError => {
  const versions = {
    currentVersion: error.currentVersion,
    receivedVersion: error.receivedVersion,
  }

  if (error.code === 'UNSUPPORTED_LEGACY_BACKUP') {
    return new ProductionBackupImportError(
      'UNSUPPORTED_LEGACY_BACKUP',
      versions,
    )
  }
  if (error.code === 'UNSUPPORTED_FUTURE_SCHEMA') {
    return new ProductionBackupImportError(
      'UNSUPPORTED_FUTURE_SCHEMA',
      versions,
    )
  }
  return new ProductionBackupImportError('INVALID_BACKUP', versions)
}

/**
 * Fail-closed production boundary for current Backup V2 import.
 *
 * Legacy and malformed input is classified before the recovery-backed
 * overwrite flow receives an inspection. Error diagnostics never include the
 * imported payload.
 */
export function assertProductionImportAllowed(
  input: string,
): ProductionImportGateResult {
  try {
    return {
      inspection: inspectBackupV2(parseJson(input)),
      kind: 'v2-overwrite',
    }
  } catch (error) {
    if (error instanceof BackupSchemaError) {
      throw normalizeSchemaError(error)
    }
    throw error
  }
}
