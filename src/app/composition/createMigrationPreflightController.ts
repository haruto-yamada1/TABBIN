import type {
  MigrationPreflightIssueCode,
  MigrationPreflightServicePort,
  MigrationPreflightStatus,
} from '@/contexts/saved-tabs/application/ports/MigrationPreflightPort'
import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import { getMigrationPreflightRuntime } from '@/contexts/saved-tabs/infrastructure/composition/migrationPreflightRuntime'

export type MigrationPreflightNoticeState =
  | { readonly status: 'not-run' }
  | { readonly status: 'healthy' }
  | { readonly status: 'stale' }
  | {
      readonly status: 'blocked'
      readonly issueCodes: readonly MigrationPreflightIssueCode[]
    }

export type MigrationPreflightNoticeController = {
  readonly readStatus: () => MigrationPreflightNoticeState
  readonly run: () => Promise<void>
  readonly copyDiagnostic: () => Promise<void>
  readonly backupCurrentData: () => Promise<void>
}

export type MigrationPreflightControllerOptions = {
  readonly download: (fileName: string, contents: string) => void
  readonly now: () => number
  readonly service: MigrationPreflightServicePort
  readonly writeClipboard: (contents: string) => Promise<void>
}

const toNoticeState = (
  status: MigrationPreflightStatus,
): MigrationPreflightNoticeState => {
  if (status.status === 'blocked') {
    return { issueCodes: status.issueCodes, status: 'blocked' }
  }
  return { status: status.status }
}

const unwrapBackup = (
  snapshot: RawLegacyStorageSnapshot,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(snapshot).flatMap(([key, entry]) =>
      entry.status === 'present' ? [[key, entry.value]] : [],
    ),
  )

export const downloadTextFile = (fileName: string, contents: string): void => {
  const url = URL.createObjectURL(
    new Blob([contents], { type: 'application/json;charset=utf-8' }),
  )
  const anchor = document.createElement('a')
  anchor.download = fileName
  anchor.href = url
  anchor.click()
  URL.revokeObjectURL(url)
}

export const createMigrationPreflightController = (
  options: MigrationPreflightControllerOptions,
): MigrationPreflightNoticeController => {
  let initialized = false
  let serviceStatus: MigrationPreflightStatus = { status: 'not-run' }
  let noticeState: MigrationPreflightNoticeState = { status: 'not-run' }

  return {
    backupCurrentData: async (): Promise<void> => {
      const source = await options.service.createCurrentDataBackup()
      const createdAt = options.now()
      const backup = {
        backupType: 'migration-preflight-raw-v1',
        createdAt,
        source: unwrapBackup(source),
      }
      options.download(
        `tabbin-migration-preflight-backup-${createdAt}.json`,
        JSON.stringify(backup),
      )
    },
    copyDiagnostic: async (): Promise<void> => {
      const diagnostic =
        serviceStatus.status === 'not-run'
          ? {
              issueCodes: ['MIGRATION_PREFLIGHT_STATE_UNAVAILABLE'],
              status: noticeState.status,
            }
          : {
              checkedAt: serviceStatus.checkedAt,
              diagnostic: serviceStatus.diagnostic,
              status: serviceStatus.status,
            }
      await options.writeClipboard(JSON.stringify(diagnostic, null, 2))
    },
    readStatus: () => noticeState,
    run: async (): Promise<void> => {
      try {
        let status: MigrationPreflightStatus
        if (!initialized) {
          initialized = true
          status = await options.service.readStatus()
          if (status.status === 'not-run') {
            status = await options.service.run()
          }
        } else {
          status = await options.service.run()
        }
        serviceStatus = status
        noticeState = toNoticeState(status)
      } catch (error) {
        noticeState = {
          issueCodes: ['MIGRATION_PREFLIGHT_STATE_UNAVAILABLE'],
          status: 'blocked',
        }
        throw error
      }
    },
  }
}

let controller: MigrationPreflightNoticeController | undefined

export const getMigrationPreflightController =
  (): MigrationPreflightNoticeController => {
    controller ??= createMigrationPreflightController({
      download: downloadTextFile,
      now: () => Date.now(),
      service: getMigrationPreflightRuntime().service,
      writeClipboard: async (contents) => {
        await globalThis.navigator.clipboard.writeText(contents)
      },
    })
    return controller
  }

export const resetMigrationPreflightControllerForTesting = (): void => {
  controller = undefined
}
