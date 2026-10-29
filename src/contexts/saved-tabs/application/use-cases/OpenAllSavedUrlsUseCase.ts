import type { OpenAllSavedUrlsCommand } from '@/contexts/saved-tabs/application/commands/OpenAllSavedUrlsCommand'
import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { OpenedUrlsDto } from '@/contexts/saved-tabs/application/dto/OpenedUrlsDto'
import type { BrowserOpenFailureReason } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import { toBrowserOpenFailureReason } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import { UrlOpeningPostProcessingError } from '@/contexts/saved-tabs/application/errors/UrlOpeningPostProcessingError'
import {
  toSavedTabsCustomProjectDto,
  toSavedTabsTabGroupDto,
  toSavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '@/contexts/saved-tabs/application/ports/BrowserWindowPort'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import {
  lookupUrlRecordIdsByUrl,
  removeUrlRecordIdsFromTabGroups,
} from '@/contexts/saved-tabs/domain/services/OpenedUrlRemovalPolicy'
import { filterUnreferencedUrlRecords } from '@/contexts/saved-tabs/domain/services/UrlReferenceService'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * `OpenAllSavedUrlsUseCase` が依存する repository / port 群。
 */
export type OpenAllSavedUrlsUseCaseDeps = {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
  readonly browserTabPort: BrowserTabPort
  readonly browserWindowPort: BrowserWindowPort
}

/**
 * 一括オープンの実行時制御。signal / observer は保存データに含めない。
 */
export type OpenAllSavedUrlsOptions = {
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: {
    readonly total: number
    readonly opened: number
    readonly failed: number
  }) => void
}

export type OpenAllSavedUrlsUseCase = (
  command: OpenAllSavedUrlsCommand,
  options?: OpenAllSavedUrlsOptions,
) => Promise<OpenedUrlsDto>

type RemovalPlan = {
  readonly previousTabGroups: readonly TabGroup[]
  readonly previousCustomProjects: readonly CustomProject[]
  readonly removedUrlRecords: readonly UrlRecord[]
  readonly updatedTabGroups: readonly TabGroup[]
  readonly updatedCustomProjects: readonly CustomProject[]
  readonly urlRecordIdsToDelete: readonly UrlRecordId[]
}

type OpeningResult = {
  readonly openedUrls: readonly string[]
  readonly openedRequestedUrls: readonly string[]
  readonly cancelledUrls: readonly string[]
  readonly failedUrls: OpenedUrlsDto['failedUrls']
}

type SavedUrlsSnapshot = {
  readonly tabGroups: readonly TabGroup[]
  readonly urlRecords: readonly UrlRecord[]
  readonly customProjects: readonly CustomProject[]
}

// Bounds native creation pressure in both modes. A new window starts with at
// most five URLs; subsequent requests target that same window via tabs.create.
const MAX_CONCURRENT_URL_OPENS = 5

type UrlOpeningOutcome = {
  readonly requestedUrl: string
  readonly openedUrl?: string
  readonly failure?: OpenedUrlsDto['failedUrls'][number]
}

const openRequestedUrls = async (
  command: OpenAllSavedUrlsCommand,
  deps: OpenAllSavedUrlsUseCaseDeps,
  options: OpenAllSavedUrlsOptions,
): Promise<OpeningResult> => {
  const outcomes: (UrlOpeningOutcome | undefined)[] = Array.from({
    length: command.urls.length,
  })
  let next = 0
  let opened = 0
  let failed = 0
  let windowId: number | undefined
  let windowFailureReason: BrowserOpenFailureReason = 'unknown'
  const report = () => {
    // Observers cannot turn confirmed creations into failed/retryable requests.
    try {
      options.onProgress?.({ total: command.urls.length, opened, failed })
    } catch {
      // Opening and its safe final result are independent of presentation errors.
    }
  }
  const record = (index: number, outcome: UrlOpeningOutcome) => {
    outcomes[index] = outcome
    if (outcome.failure) {
      failed += 1
    } else {
      opened += 1
    }
    report()
  }
  report()

  if (command.mode === 'newWindow' && !options.signal?.aborted) {
    const batch = command.urls.slice(0, MAX_CONCURRENT_URL_OPENS)
    next = batch.length
    try {
      const result = await deps.browserWindowPort.openWithUrls({
        focused: true,
        urls: batch,
      })
      windowId = result.windowId
      const remainingConfirmed = [...result.urls]
      batch.forEach((url, index) => {
        const confirmedIndex = remainingConfirmed.indexOf(url)
        if (confirmedIndex >= 0) {
          remainingConfirmed.splice(confirmedIndex, 1)
          record(index, { requestedUrl: url, openedUrl: url })
        } else {
          record(index, {
            requestedUrl: url,
            failure: { url, reason: 'unknown' },
          })
        }
      })
    } catch (error) {
      const reason = toBrowserOpenFailureReason(error)
      windowFailureReason = reason
      batch.forEach((url, index) => {
        record(index, { requestedUrl: url, failure: { url, reason } })
      })
    }
  }

  const openOne = async (index: number) => {
    const url = command.urls[index]
    if (url === undefined) {
      return
    }
    try {
      // Never silently open remaining URLs in another/current window when the
      // target window was not confirmed. Keep them retryable instead.
      if (command.mode === 'newWindow' && windowId === undefined) {
        record(index, {
          requestedUrl: url,
          failure: { url, reason: windowFailureReason },
        })
        return
      }
      const result = await deps.browserTabPort.open({
        url,
        ...(windowId === undefined ? {} : { active: false, windowId }),
      })
      record(index, { requestedUrl: url, openedUrl: result.url })
    } catch (error) {
      record(index, {
        requestedUrl: url,
        failure: { url, reason: toBrowserOpenFailureReason(error) },
      })
    }
  }
  const worker = async (): Promise<void> => {
    if (next >= command.urls.length || options.signal?.aborted) {
      return
    }
    await openOne(next++)
    await worker()
  }

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_URL_OPENS, command.urls.length) },
      worker,
    ),
  )
  const confirmed = outcomes.filter((outcome) => outcome !== undefined)
  return {
    openedRequestedUrls: confirmed
      .filter((outcome) => !outcome.failure)
      .map((outcome) => outcome.requestedUrl),
    openedUrls: confirmed.flatMap((outcome) =>
      outcome.openedUrl === undefined ? [] : [outcome.openedUrl],
    ),
    failedUrls: confirmed.flatMap((outcome) =>
      outcome.failure ? [outcome.failure] : [],
    ),
    cancelledUrls: command.urls.slice(next),
  }
}

const computeRemovalPlan = ({
  openedUrls,
  removeTabAfterOpen,
  urlRecords,
  tabGroups,
  customProjects,
}: {
  readonly openedUrls: readonly string[]
  readonly removeTabAfterOpen: boolean
  readonly urlRecords: readonly UrlRecord[]
  readonly tabGroups: readonly TabGroup[]
  readonly customProjects: readonly CustomProject[]
}): RemovalPlan => {
  const previousTabGroups = tabGroups
  const previousCustomProjects = customProjects
  const previousUrlRecords = urlRecords

  if (!removeTabAfterOpen) {
    return {
      previousCustomProjects,
      previousTabGroups,
      removedUrlRecords: [],
      updatedCustomProjects: [...previousCustomProjects],
      updatedTabGroups: [...previousTabGroups],
      urlRecordIdsToDelete: [],
    }
  }

  // 開いた URL 文字列 → UrlRecordId への逆引き。UrlRecord に存在しない
  // URL（保存タブに登録されていない URL）は単純に無視する。
  const effectiveIds = lookupUrlRecordIdsByUrl({ urlRecords, urls: openedUrls })
  if (effectiveIds.size === 0) {
    return {
      previousCustomProjects,
      previousTabGroups,
      removedUrlRecords: [],
      updatedCustomProjects: [...previousCustomProjects],
      updatedTabGroups: [...previousTabGroups],
      urlRecordIdsToDelete: [],
    }
  }

  const updatedTabGroups = removeUrlRecordIdsFromTabGroups({
    tabGroups: previousTabGroups,
    urlRecordIdsToRemove: effectiveIds,
  })

  const updatedCustomProjects: CustomProject[] = previousCustomProjects.map(
    (project) => {
      const remaining = project.memberships.filter(
        ({ urlId }) => !effectiveIds.has(urlId),
      )
      if (remaining.length === project.memberships.length) {
        return project
      }
      return { ...project, memberships: remaining }
    },
  )

  const urlRecordsInTarget = previousUrlRecords.filter((record) =>
    effectiveIds.has(record.id),
  )
  const unreferenced = filterUnreferencedUrlRecords({
    customProjects: updatedCustomProjects,
    tabGroups: updatedTabGroups,
    urlRecords: urlRecordsInTarget,
  })

  return {
    previousCustomProjects,
    previousTabGroups,
    removedUrlRecords: unreferenced,
    updatedCustomProjects,
    updatedTabGroups,
    urlRecordIdsToDelete: unreferenced.map((record) => record.id),
  }
}

const openAndRemoveFromSnapshot = async (
  command: OpenAllSavedUrlsCommand,
  deps: OpenAllSavedUrlsUseCaseDeps,
  savedUrls: SavedUrlsSnapshot,
  options: OpenAllSavedUrlsOptions,
): Promise<OpenedUrlsDto> => {
  const { openedUrls, openedRequestedUrls, failedUrls, cancelledUrls } =
    await openRequestedUrls(command, deps, options)

  try {
    const plan = computeRemovalPlan({
      customProjects: savedUrls.customProjects,
      // Browser API may canonicalize the returned URL (for example, adding a
      // trailing slash). The requested URLs identify the saved records that
      // were successfully opened, so use them for removal matching.
      openedUrls: openedRequestedUrls,
      removeTabAfterOpen: command.removeTabAfterOpen,
      tabGroups: savedUrls.tabGroups,
      urlRecords: savedUrls.urlRecords,
    })

    if (plan.urlRecordIdsToDelete.length === 0) {
      return {
        failedUrls,
        cancelledUrls,
        openedUrls,
        removedUrlRecordIds: [],
        removedUrlRecords: [],
        snapshot: null,
      }
    }

    // 変更があった場合のみ書き戻す。`removeUrlRecordIdsFromTabGroups` は
    // 変更があった TabGroup だけ新しい object を返すので reference 比較で
    // 検出できる。
    if (
      plan.updatedTabGroups.length !== plan.previousTabGroups.length ||
      plan.updatedTabGroups.some(
        (group, index) => group !== plan.previousTabGroups[index],
      )
    ) {
      await deps.tabGroupRepository.saveAll(plan.updatedTabGroups)
    }
    if (
      plan.updatedCustomProjects.length !==
        plan.previousCustomProjects.length ||
      plan.updatedCustomProjects.some(
        (project, index) => project !== plan.previousCustomProjects[index],
      )
    ) {
      await deps.customProjectRepository.saveAll(plan.updatedCustomProjects)
    }
    await deps.urlRecordRepository.removeByIds(plan.urlRecordIdsToDelete)

    const snapshot: OpenedUrlsRestoreSnapshot = {
      customProjects: plan.previousCustomProjects.map(
        toSavedTabsCustomProjectDto,
      ),
      savedTabs: plan.previousTabGroups.map(toSavedTabsTabGroupDto),
      urlRecords: plan.removedUrlRecords.map(toSavedTabsUrlRecordDto),
    }

    return {
      failedUrls,
      cancelledUrls,
      openedUrls,
      removedUrlRecordIds: plan.urlRecordIdsToDelete,
      removedUrlRecords: plan.removedUrlRecords.map(toSavedTabsUrlRecordDto),
      snapshot,
    }
  } catch {
    throw new UrlOpeningPostProcessingError(
      openedUrls,
      failedUrls,
      cancelledUrls,
    )
  }
}

/**
 * `OpenAllSavedUrlsUseCase` を生成する。
 *
 * 責務:
 * 1. 入力 URL 配列を `BrowserTabPort` / `BrowserWindowPort` 経由で一括オープンする。
 * 2. `removeTabAfterOpen` が有効なら、成功した `UrlRecordId` を `TabGroup` /
 *    `CustomProject` の `urlIds` から取り除く。
 * 3. 削除後に他で参照されなくなった `UrlRecord` を
 *    `UrlRecordRepository.removeByIds` で削除する。
 * 4. Undo 用 snapshot を `OpenedUrlsDto` にまとめて返す。
 *
 * 既存 `OpenSavedUrlUseCase` と同じ `removeUrlRecordIdsFromTabGroups` /
 * `filterUnreferencedUrlRecords` を再利用することで、1 件と複数で
 * 削除ポリシーが一致するようにしている。
 */
export const createOpenAllSavedUrlsUseCase = (
  deps: OpenAllSavedUrlsUseCaseDeps,
): OpenAllSavedUrlsUseCase => {
  return async (command, options = {}) => {
    if (command.urls.length === 0) {
      return {
        failedUrls: [],
        cancelledUrls: [],
        openedUrls: [],
        removedUrlRecords: [],
        removedUrlRecordIds: [],
        snapshot: null,
      }
    }

    const [allTabGroups, allUrlRecords, allCustomProjects] = await Promise.all([
      deps.tabGroupRepository.findAll(),
      deps.urlRecordRepository.findAll(),
      deps.customProjectRepository.findAll(),
    ])

    // 保存状態の取得が成功してから開く。取得失敗時にブラウザ操作だけが
    // 先行しないよう、この snapshot をオープン・削除フェーズへ渡す。
    return openAndRemoveFromSnapshot(
      command,
      deps,
      {
        customProjects: allCustomProjects,
        tabGroups: allTabGroups,
        urlRecords: allUrlRecords,
      },
      options,
    )
  }
}
