import type { OpenAllSavedUrlsCommand } from '@/contexts/saved-tabs/application/commands/OpenAllSavedUrlsCommand'
import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { OpenedUrlsDto } from '@/contexts/saved-tabs/application/dto/OpenedUrlsDto'
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
 * `OpenAllSavedUrlsUseCase` の関数型。
 */
export type OpenAllSavedUrlsUseCase = (
  command: OpenAllSavedUrlsCommand,
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
  readonly failedUrls: OpenedUrlsDto['failedUrls']
}

type SavedUrlsSnapshot = {
  readonly tabGroups: readonly TabGroup[]
  readonly urlRecords: readonly UrlRecord[]
  readonly customProjects: readonly CustomProject[]
}

const openRequestedUrls = async (
  command: OpenAllSavedUrlsCommand,
  deps: OpenAllSavedUrlsUseCaseDeps,
): Promise<OpeningResult> => {
  if (command.mode === 'newWindow') {
    try {
      const result = await deps.browserWindowPort.openWithUrls({
        focused: true,
        urls: [...command.urls],
      })
      const confirmedUrls = new Set(result.urls)
      const openedRequestedUrls = command.urls.filter((url) =>
        confirmedUrls.has(url),
      )
      return {
        openedRequestedUrls,
        openedUrls: openedRequestedUrls,
        failedUrls: command.urls
          .filter((url) => !confirmedUrls.has(url))
          .map((url) => ({ url, reason: 'unknown' })),
      }
    } catch (error) {
      return {
        openedRequestedUrls: [],
        openedUrls: [],
        failedUrls: command.urls.map((url) => ({
          url,
          reason: toBrowserOpenFailureReason(error),
        })),
      }
    }
  }

  const results = await Promise.all(
    command.urls.map(async (url): Promise<OpeningResult> => {
      try {
        const result = await deps.browserTabPort.open({ url })
        return {
          openedRequestedUrls: [url],
          openedUrls: [result.url],
          failedUrls: [],
        }
      } catch (error) {
        return {
          openedRequestedUrls: [],
          openedUrls: [],
          failedUrls: [{ url, reason: toBrowserOpenFailureReason(error) }],
        }
      }
    }),
  )
  return {
    openedRequestedUrls: results.flatMap(
      (result) => result.openedRequestedUrls,
    ),
    openedUrls: results.flatMap((result) => result.openedUrls),
    failedUrls: results.flatMap((result) => result.failedUrls),
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
): Promise<OpenedUrlsDto> => {
  const { openedUrls, openedRequestedUrls, failedUrls } =
    await openRequestedUrls(command, deps)

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
      openedUrls,
      removedUrlRecordIds: plan.urlRecordIdsToDelete,
      removedUrlRecords: plan.removedUrlRecords.map(toSavedTabsUrlRecordDto),
      snapshot,
    }
  } catch {
    throw new UrlOpeningPostProcessingError(openedUrls, failedUrls)
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
  return async (command) => {
    if (command.urls.length === 0) {
      return {
        failedUrls: [],
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
    return openAndRemoveFromSnapshot(command, deps, {
      customProjects: allCustomProjects,
      tabGroups: allTabGroups,
      urlRecords: allUrlRecords,
    })
  }
}
