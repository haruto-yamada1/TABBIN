import { importBackupV2WithRecovery } from '@/app/composition/optionsBackupRecovery'
import { mergeLegacyBackupIntoIndexedDb } from '@/app/composition/optionsLegacyBackupMerge'
import { logger } from '@/lib/logging/logger'
import { assertBackupSerializedBytes } from '@/lib/persistence/backupResourcePolicy'
import {
  BackupSchemaError,
  detectBackupFormat,
} from '@/lib/persistence/backupSchema'
import { formatLocaleDateTime } from '@/utils/localDateTime'

import type { LegacyBackupAdvisory } from './compatibility/legacyBackupPolicy'
import { getCurrentUtcDateOnly } from './currentImportDate'
import { LegacyBackupImportError } from './legacy/LegacyBackupAdapter'
import { assertProductionImportAllowed } from './productionImportGate'
import type { ProductionImportGateOptions } from './productionImportGate'
import { inspectBackupV2 } from './v2/BackupV2Inspector'

type ImportFailureStage =
  | 'compatibility'
  | 'format-detection'
  | 'legacy-merge'
  | 'v2-overwrite'

type ImportFailureDiagnostic = {
  readonly errorCode: string
  readonly issueCodes: readonly string[]
  readonly stage: ImportFailureStage
}

type ImportResult =
  | { readonly message: string; readonly success: true }
  | {
      readonly diagnostic?: ImportFailureDiagnostic
      readonly message: string
      readonly success: false
    }

type Translate = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string

const IMPORT_FAILURE_ACTIONS = {
  compatibility: 'compatibility',
  'format-detection': 'formatDetection',
  'legacy-merge': 'legacyMerge',
  'v2-overwrite': 'v2Overwrite',
} as const satisfies Readonly<Record<ImportFailureStage, string>>

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_:-]{0,127}$/u

const readSafeErrorCode = (error: unknown): string => {
  try {
    if (error instanceof BackupSchemaError) {
      return error.code
    }
    if (error instanceof LegacyBackupImportError) {
      return error.code
    }
    if (typeof error === 'object' && error !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
      const code: unknown =
        descriptor && 'value' in descriptor ? descriptor.value : null
      if (typeof code === 'string' && SAFE_ERROR_CODE_PATTERN.test(code)) {
        return code
      }
    }
  } catch {
    // Untrusted errors may be Proxies. Diagnostics must remain best-effort.
  }
  return 'UNKNOWN_IMPORT_ERROR'
}

const readLegacyBackupImportError = (
  error: unknown,
):
  | {
      readonly code: LegacyBackupImportError['code']
      readonly issueCodes: readonly string[]
    }
  | undefined => {
  try {
    return error instanceof LegacyBackupImportError
      ? { code: error.code, issueCodes: [...error.issueCodes] }
      : undefined
  } catch {
    return undefined
  }
}

const createImportFailureDiagnostic = (
  error: unknown,
  stage: ImportFailureStage,
): ImportFailureDiagnostic => {
  const legacyError = readLegacyBackupImportError(error)
  return {
    errorCode: legacyError?.code ?? readSafeErrorCode(error),
    issueCodes: legacyError?.issueCodes ?? [],
    stage: legacyError ? 'compatibility' : stage,
  }
}

const downloadAsJson = (data: unknown, filename: string): void => {
  const json = JSON.stringify(data)
  const blob = new Blob([json], {
    type: 'application/json',
  })
  assertBackupSerializedBytes(blob.size)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()

  requestAnimationFrame(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  })
}

const importSettings = async (
  jsonData: string,
  mergeData = true,
  translate?: Translate,
  options: Partial<ProductionImportGateOptions> = {},
): Promise<ImportResult> => {
  let stage: ImportFailureStage = 'format-detection'
  try {
    const gateResult = assertProductionImportAllowed(jsonData, {
      importDate: options.importDate ?? getCurrentUtcDateOnly(),
      importMode: mergeData ? 'merge' : 'overwrite',
    })
    if (!gateResult) {
      return {
        success: false,
        message: translate
          ? translate('options.importExport.importFormatError')
          : 'インポートされたデータの形式が正しくありません',
      }
    }
    if (gateResult.kind === 'legacy-merge') {
      stage = 'legacy-merge'
      const mergeResult = await mergeLegacyBackupIntoIndexedDb(gateResult)
      return {
        success: true,
        message: translate
          ? translate('options.importExport.mergeSuccess', undefined, {
              categories: String(mergeResult.addedEntityCounts.groups),
              domains: String(mergeResult.addedEntityCounts.collections),
              unresolved: '',
            })
          : `データをマージしました (${mergeResult.addedEntityCounts.groups}個のカテゴリ、${mergeResult.addedEntityCounts.collections}個のドメインを追加)`,
      }
    }

    stage = 'v2-overwrite'
    await importBackupV2WithRecovery(gateResult.inspection)
    const formattedTimestamp = formatLocaleDateTime(
      new Date(gateResult.inspection.preview.exportedAt).getTime(),
    )
    return {
      success: true,
      message: translate
        ? translate('options.importExport.replaceSuccess', undefined, {
            timestamp: formattedTimestamp,
            unresolved: '',
            version: gateResult.inspection.preview.appVersion,
          })
        : `設定とタブデータを置き換えました（バージョン: ${gateResult.inspection.preview.appVersion}、作成日時: ${formattedTimestamp}）`,
    }
  } catch (error) {
    const diagnostic = createImportFailureDiagnostic(error, stage)
    logger.error(
      'options_backup_import_failed',
      {
        code: diagnostic.errorCode,
      },
      {
        action: IMPORT_FAILURE_ACTIONS[diagnostic.stage],
      },
    )
    const baseMessage = translate
      ? translate('options.importExport.importError')
      : 'データのインポート中にエラーが発生しました'
    return {
      diagnostic,
      success: false,
      message: `${baseMessage} (${diagnostic.stage}: ${diagnostic.errorCode})`,
    }
  }
}

const getImportPreview = (
  jsonData: string,
): {
  success: boolean
  message: string
  preview?: {
    version: string
    timestamp: string
    categoriesCount: number
    domainsCount: number
    formatKind: 'current-v2' | 'legacy'
    projectsCount: number
    hasAiChat: boolean
    hasAnalytics: boolean
    legacyBackupAdvisory?: LegacyBackupAdvisory
  }
} => {
  try {
    const parsed: unknown = JSON.parse(jsonData)
    if (detectBackupFormat(parsed).kind === 'versioned') {
      const inspection = inspectBackupV2(parsed, {
        importDate: getCurrentUtcDateOnly(),
      })
      const domainCollections = inspection.data.savedTabs.collections.filter(
        (collection) => collection.definition.type === 'domain',
      ).length
      const customCollections =
        inspection.data.savedTabs.collections.length - domainCollections
      return {
        success: true,
        message: 'データの解析に成功しました',
        preview: {
          version: inspection.preview.appVersion,
          timestamp: inspection.preview.exportedAt,
          categoriesCount: inspection.preview.entityCounts.categories,
          domainsCount: domainCollections,
          formatKind: 'current-v2',
          projectsCount: customCollections,
          hasAiChat: inspection.preview.entityCounts.conversations > 0,
          hasAnalytics: inspection.preview.entityCounts.analyticsViews > 0,
        },
      }
    }
    const inspection = inspectBackupV2(parsed, {
      importDate: getCurrentUtcDateOnly(),
    })
    if (inspection.preview.formatKind !== 'legacy') {
      throw new BackupSchemaError('INVALID_SCHEMA')
    }
    const domainCollections = inspection.data.savedTabs.collections.filter(
      (collection) => collection.definition.type === 'domain',
    ).length
    const customCollections =
      inspection.data.savedTabs.collections.length - domainCollections
    return {
      success: true,
      message: 'データの解析に成功しました',
      preview: {
        version: inspection.preview.appVersion,
        timestamp: inspection.preview.exportedAt,
        categoriesCount: inspection.preview.entityCounts.groups,
        domainsCount: domainCollections,
        formatKind: 'legacy',
        projectsCount: customCollections,
        hasAiChat: inspection.preview.entityCounts.conversations > 0,
        hasAnalytics: inspection.preview.entityCounts.analyticsViews > 0,
        legacyBackupAdvisory: inspection.preview.advisory,
      },
    }
  } catch (error) {
    if (error instanceof BackupSchemaError) {
      return {
        success: false,
        message: 'インポートされたデータの形式が正しくありません',
      }
    }
    console.error('プレビュー解析エラー:', error)
    return {
      success: false,
      message: 'データの解析中にエラーが発生しました',
    }
  }
}

export { downloadAsJson, getImportPreview, importSettings }
export type {
  ImportFailureDiagnostic,
  ImportFailureStage,
  ImportResult,
  Translate,
}
