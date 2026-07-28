import {
  BackupSchemaError,
  detectBackupFormat,
} from '@/lib/persistence/backupSchema'

import { isLegacyBackupImportSupported } from './compatibility/legacyBackupPolicy'
import type { LegacyBackupMergeInput } from './legacy/ImportLegacyBackupMergeUseCase'
import { LegacyBackupImportError } from './legacy/LegacyBackupAdapter'
import { LegacyBackupV0Schema } from './legacy/LegacyBackupV0Schema'
import { inspectBackupV2 } from './v2/BackupV2Inspector'

export type ProductionBackupImportErrorCode = 'OVERWRITE_RECOVERY_UNAVAILABLE'

export class ProductionBackupImportError extends Error {
  readonly code: ProductionBackupImportErrorCode

  constructor(code: ProductionBackupImportErrorCode) {
    super('Backup overwrite recovery is unavailable')
    this.name = 'ProductionBackupImportError'
    this.code = code
  }
}

export type ProductionImportGateOptions = {
  readonly importDate: string
  readonly importMode: 'merge' | 'overwrite'
}

export type ProductionImportGateResult =
  | ({ readonly kind: 'legacy-merge' } & LegacyBackupMergeInput)
  | undefined

type JsonParseResult =
  | { readonly success: false }
  | { readonly data: unknown; readonly success: true }

const parseJson = (input: string): JsonParseResult => {
  try {
    const parsed: unknown = JSON.parse(input)
    return { data: parsed, success: true }
  } catch {
    return { success: false }
  }
}

/**
 * Fail-closed production boundary for backup import.
 *
 * Current V2 is validated before reporting the temporary #740 recovery
 * blocker. Schema-less backups are strictly validated before entering the
 * legacy flow through the cutoff. Invalid JSON is left to the existing parser
 * so its user-facing behavior does not change.
 */
export function assertProductionImportAllowed(
  input: string,
  options: ProductionImportGateOptions,
): ProductionImportGateResult
export function assertProductionImportAllowed(
  input: string,
  options?: ProductionImportGateOptions,
): ProductionImportGateResult {
  const importDate = options?.importDate
  if (typeof importDate !== 'string') {
    throw new TypeError('Import date is required')
  }
  const importMode = options?.importMode
  if (importMode !== 'merge' && importMode !== 'overwrite') {
    throw new TypeError('Import mode is required')
  }
  const isLegacySupported = isLegacyBackupImportSupported(importDate)
  const parseResult = parseJson(input)
  if (!parseResult.success) {
    return undefined
  }

  const format = detectBackupFormat(parseResult.data)
  if (format.kind === 'legacy') {
    if (!isLegacySupported) {
      throw new LegacyBackupImportError('LEGACY_IMPORT_CUTOFF_REACHED')
    }
    const legacyResult = LegacyBackupV0Schema.safeParse(parseResult.data)
    if (!legacyResult.success) {
      throw new BackupSchemaError('INVALID_SCHEMA')
    }
    const inspection = inspectBackupV2(parseResult.data, { importDate })
    if (inspection.preview.formatKind !== 'legacy') {
      throw new BackupSchemaError('INVALID_SCHEMA')
    }
    if (importMode === 'overwrite') {
      throw new ProductionBackupImportError('OVERWRITE_RECOVERY_UNAVAILABLE')
    }
    return {
      inspection: {
        ...inspection,
        preview: inspection.preview,
      },
      kind: 'legacy-merge',
      userSettingsPatch: legacyResult.data.userSettings,
    }
  }

  inspectBackupV2(parseResult.data, {
    importDate,
  })
  throw new ProductionBackupImportError('OVERWRITE_RECOVERY_UNAVAILABLE')
}
