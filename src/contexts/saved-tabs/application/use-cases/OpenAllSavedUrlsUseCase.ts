import type { OpenAllSavedUrlsCommand } from '@/contexts/saved-tabs/application/commands/OpenAllSavedUrlsCommand'
import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { OpenedUrlsDto } from '@/contexts/saved-tabs/application/dto/OpenedUrlsDto'
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
export interface OpenAllSavedUrlsUseCaseDeps {
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

interface RemovalPlan {
  readonly previousTabGroups: readonly TabGroup[]
  readonly previousCustomProjects: readonly CustomProject[]
  readonly removedUrlRecords: readonly UrlRecord[]
  readonly updatedTabGroups: readonly TabGroup[]
  readonly updatedCustomProjects: readonly CustomProject[]
  readonly urlRecordIdsToDelete: readonly UrlRecordId[]
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
      const remaining = project.urlIds.filter(
        (urlId) => !effectiveIds.has(urlId),
      )
      if (remaining.length === project.urlIds.length) {
        return project
      }
      return { ...project, urlIds: remaining }
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

/**
 * `OpenAllSavedUrlsUseCase` を生成する。
 *
 * 責務:
 * 1. 入力 URL 配列を `BrowserTabPort` / `BrowserWindowPort` 経由で一括オープンする。
 * 2. `removeTabAfterOpen` が有効なら、対象 `UrlRecordId` を `TabGroup` /
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

    const openedUrls =
      command.mode === 'newWindow'
        ? (
            await deps.browserWindowPort.openWithUrls({
              focused: true,
              urls: [...command.urls],
            })
          ).urls
        : await Promise.all(
            command.urls.map(async (url) => deps.browserTabPort.open({ url })),
          ).then((results) => results.map((result) => result.url))

    const plan = computeRemovalPlan({
      customProjects: allCustomProjects,
      // Browser API may canonicalize the returned URL (for example, adding a
      // trailing slash). The requested URLs identify the saved records that
      // were successfully opened, so use them for removal matching.
      openedUrls: command.urls,
      removeTabAfterOpen: command.removeTabAfterOpen,
      tabGroups: allTabGroups,
      urlRecords: allUrlRecords,
    })

    if (plan.urlRecordIdsToDelete.length === 0) {
      return {
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
      customProjectOrder: undefined,
      customProjects: plan.previousCustomProjects,
      parentCategories: undefined,
      savedTabs: plan.previousTabGroups,
      urlRecords: plan.removedUrlRecords,
    }

    return {
      openedUrls,
      removedUrlRecordIds: plan.urlRecordIdsToDelete,
      removedUrlRecords: plan.removedUrlRecords,
      snapshot,
    }
  }
}
