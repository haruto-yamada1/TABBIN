import { importBackupV2WithRecovery } from '@/app/composition/optionsBackupRecovery'
import { logger } from '@/lib/logging/logger'
import { assertBackupSerializedBytes } from '@/lib/persistence/backupResourcePolicy'
import { formatLocaleDateTime } from '@/utils/localDateTime'

import {
  assertProductionImportAllowed,
  ProductionBackupImportError,
} from './productionImportGate'

type ImportFailureStage = 'format-detection' | 'v2-overwrite'

type ImportFailureDiagnostic = {
  readonly errorCode: string
  readonly issueCodes: readonly string[]
  readonly stage: ImportFailureStage
}

type ImportResult =
  | { readonly message: string; readonly success: true }
  | {
      readonly diagnostic: ImportFailureDiagnostic
      readonly message: string
      readonly success: false
    }

type Translate = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string

const IMPORT_FAILURE_ACTIONS = {
  'format-detection': 'formatDetection',
  'v2-overwrite': 'v2Overwrite',
} as const satisfies Readonly<Record<ImportFailureStage, string>>

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_:-]{0,127}$/u

const readSafeErrorCode = (error: unknown): string => {
  try {
    if (error instanceof ProductionBackupImportError) {
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

const createImportFailureDiagnostic = (
  error: unknown,
  stage: ImportFailureStage,
): ImportFailureDiagnostic => ({
  errorCode: readSafeErrorCode(error),
  issueCodes: [],
  stage,
})

const getKnownImportErrorMessage = (
  error: ProductionBackupImportError,
  translate?: Translate,
): string => {
  if (error.code === 'UNSUPPORTED_LEGACY_BACKUP') {
    return translate
      ? translate('options.importExport.unsupportedLegacyBackup')
      : 'このバックアップ形式はサポートされていません。現在のバックアップ形式のみインポートできます。'
  }
  if (error.code === 'UNSUPPORTED_FUTURE_SCHEMA') {
    return translate
      ? translate('options.importExport.unsupportedFutureBackup')
      : 'このバックアップは新しいバージョンで作成されているため、現在のバージョンではインポートできません。'
  }
  return translate
    ? translate('options.importExport.importFormatError')
    : 'インポートされたデータの形式が正しくありません'
}

const getImportFailureMessage = (
  error: unknown,
  diagnostic: ImportFailureDiagnostic,
  translate?: Translate,
): string => {
  if (error instanceof ProductionBackupImportError) {
    return getKnownImportErrorMessage(error, translate)
  }
  const baseMessage = translate
    ? translate('options.importExport.importError')
    : 'データのインポート中にエラーが発生しました'
  return `${baseMessage} (${diagnostic.stage}: ${diagnostic.errorCode})`
}

const downloadAsJson = async (
  data: unknown,
  filename: string,
): Promise<void> => {
  const json = JSON.stringify(data)
  const blob = new Blob([json], {
    type: 'application/json',
  })
  assertBackupSerializedBytes(blob.size)
  const anchor = document.createElement('a')
  const url = URL.createObjectURL(blob)
  try {
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  } finally {
    try {
      anchor.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

const importSettings = async (
  jsonData: string,
  translate?: Translate,
): Promise<ImportResult> => {
  let stage: ImportFailureStage = 'format-detection'
  try {
    const gateResult = assertProductionImportAllowed(jsonData)

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
    return {
      diagnostic,
      success: false,
      message: getImportFailureMessage(error, diagnostic, translate),
    }
  }
}

type ImportPreview = {
  readonly categoriesCount: number
  readonly domainsCount: number
  readonly hasAiChat: boolean
  readonly hasAnalytics: boolean
  readonly projectsCount: number
  readonly timestamp: string
  readonly version: string
}

type ImportPreviewResult =
  | {
      readonly message: string
      readonly preview: ImportPreview
      readonly success: true
    }
  | {
      readonly diagnostic: ImportFailureDiagnostic
      readonly message: string
      readonly success: false
    }

const getImportPreview = (
  jsonData: string,
  translate?: Translate,
): ImportPreviewResult => {
  try {
    const { inspection } = assertProductionImportAllowed(jsonData)
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
        projectsCount: customCollections,
        hasAiChat: inspection.preview.entityCounts.conversations > 0,
        hasAnalytics: inspection.preview.entityCounts.analyticsViews > 0,
      },
    }
  } catch (error) {
    const diagnostic = createImportFailureDiagnostic(error, 'format-detection')
    return {
      diagnostic,
      success: false,
      message: getImportFailureMessage(error, diagnostic, translate),
    }
  }
}

export { downloadAsJson, getImportPreview, importSettings }
export type {
  ImportFailureDiagnostic,
  ImportFailureStage,
  ImportPreview,
  ImportPreviewResult,
  ImportResult,
  Translate,
}
