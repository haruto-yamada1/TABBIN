import type { TabGroup } from '../../domain/entities/TabGroup'
import type { UrlRecord } from '../../domain/entities/UrlRecord'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { isUrlRecordReferencedElsewhere } from '../../domain/services/UrlReferenceService'
import type { UrlRecordId } from '../../domain/value-objects/UrlRecordId'
import type { DeleteSavedUrlsCommand } from '../commands/DeleteSavedUrlsCommand'
import type { OpenedUrlsRestoreSnapshot } from '../commands/RestoreOpenedUrlsSnapshotCommand'
import type { DeletedSavedUrlsDto } from '../dto/DeletedSavedUrlsDto'

/**
 * `DeleteSavedUrlsUseCase` が依存する repository 群。
 */
export interface DeleteSavedUrlsUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `DeleteSavedUrlsUseCase` の関数型。
 */
export type DeleteSavedUrlsUseCase = (
  command: DeleteSavedUrlsCommand,
) => Promise<DeletedSavedUrlsDto>

/**
 * `DeleteSavedUrlsUseCase` を生成する。
 *
 * 責務:
 * 1. 対象 `TabGroup` を取得する。見つからなければ `SavedTabsDomainError` を投げる。
 * 2. URL 文字列群を `UrlRecordId` 群へ逆引きする。1 件も引けない場合は
 *    `SavedTabsDomainError` を投げる。
 * 3. 該当 `UrlRecordId` を `TabGroup` の `urlIds` から取り除く。
 *    `urlIds` が空になった場合は `TabGroup` 自体を削除する。
 * 4. 他で参照されていない `UrlRecord` を `UrlRecordRepository.removeByIds` で削除する。
 * 5. Undo 用 snapshot を `DeletedSavedUrlsDto` にまとめて返す。
 *
 * 1 件も削除できなかったケース（urls が空、storage に該当が無い、
 * TabGroup の urlIds に 1 件も含まれていない）では `snapshot: null` を返す。
 */
export const createDeleteSavedUrlsUseCase = (
  deps: DeleteSavedUrlsUseCaseDeps,
): DeleteSavedUrlsUseCase => {
  return async (command) => {
    if (command.urls.length === 0) {
      return {
        removedTabGroupIds: [],
        removedUrlRecordIds: [],
        removedUrlRecords: [],
        snapshot: null,
      }
    }

    const [allTabGroups, allUrlRecords, allCustomProjects] = await Promise.all([
      deps.tabGroupRepository.findAll(),
      deps.urlRecordRepository.findAll(),
      deps.customProjectRepository.findAll(),
    ])

    const targetGroup = allTabGroups.find(
      (group) => group.id === command.tabGroupId,
    )
    if (!targetGroup) {
      throw new SavedTabsDomainError(
        '削除対象の TabGroup が見つかりません',
        'TAB_GROUP_NOT_FOUND',
      )
    }

    const targetUrlSet = new Set(command.urls)
    const targetUrlRecords = allUrlRecords.filter((record) =>
      targetUrlSet.has(record.url),
    )
    if (targetUrlRecords.length === 0) {
      throw new SavedTabsDomainError(
        '削除対象の UrlRecord が見つかりません',
        'URL_RECORD_NOT_FOUND',
      )
    }

    const previousGroup: TabGroup = targetGroup
    const previousUrlRecords: UrlRecord[] = targetUrlRecords
    const targetUrlIds = new Set<UrlRecordId>(
      targetUrlRecords.map((record) => record.id),
    )

    const groupHasMatch = targetGroup.urlIds.some((urlId) =>
      targetUrlIds.has(urlId),
    )
    if (!groupHasMatch) {
      // 対象 TabGroup に該当 URL が 1 つも無い場合は no-op。
      return {
        removedTabGroupIds: [],
        removedUrlRecordIds: [],
        removedUrlRecords: [],
        snapshot: null,
      }
    }

    const remainingUrlIds = targetGroup.urlIds.filter(
      (urlId) => !targetUrlIds.has(urlId),
    )
    const isGroupEmpty = remainingUrlIds.length === 0
    const updatedGroups = isGroupEmpty
      ? allTabGroups.filter((group) => group.id !== targetGroup.id)
      : allTabGroups.map((group) =>
          group.id === targetGroup.id
            ? { ...group, urlIds: remainingUrlIds }
            : group,
        )

    const urlRecordsToDelete: UrlRecordId[] = []
    for (const recordId of targetUrlIds) {
      const stillReferenced = isUrlRecordReferencedElsewhere({
        customProjects: allCustomProjects,
        origin: { id: targetGroup.id, kind: 'tabGroup' },
        tabGroups: isGroupEmpty ? [] : updatedGroups,
        urlRecordId: recordId,
      })
      if (!stillReferenced) {
        urlRecordsToDelete.push(recordId)
      }
    }

    if (
      updatedGroups.length !== allTabGroups.length ||
      updatedGroups.some((group, index) => group !== allTabGroups[index])
    ) {
      await deps.tabGroupRepository.saveAll(updatedGroups)
    }
    if (urlRecordsToDelete.length > 0) {
      await deps.urlRecordRepository.removeByIds(urlRecordsToDelete)
    }

    const removedUrlRecords = previousUrlRecords.filter((record) =>
      urlRecordsToDelete.includes(record.id),
    )

    if (urlRecordsToDelete.length === 0 && !isGroupEmpty) {
      return {
        removedTabGroupIds: [],
        removedUrlRecordIds: [],
        removedUrlRecords: [],
        snapshot: null,
      }
    }

    const snapshot: OpenedUrlsRestoreSnapshot = {
      customProjectOrder: undefined,
      customProjects: undefined,
      parentCategories: undefined,
      savedTabs: isGroupEmpty ? [previousGroup] : [],
      urlRecords: removedUrlRecords,
    }

    return {
      removedTabGroupIds: isGroupEmpty ? [previousGroup.id] : [],
      removedUrlRecordIds: urlRecordsToDelete,
      removedUrlRecords,
      snapshot,
    }
  }
}
