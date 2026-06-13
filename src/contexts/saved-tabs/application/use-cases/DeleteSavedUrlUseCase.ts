import type { TabGroup } from '../../domain/entities/TabGroup'
import type { UrlRecord } from '../../domain/entities/UrlRecord'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { isUrlRecordReferencedElsewhere } from '../../domain/services/UrlReferenceService'
import type { UrlRecordId } from '../../domain/value-objects/UrlRecordId'
import type { DeleteSavedUrlCommand } from '../commands/DeleteSavedUrlCommand'
import type { OpenedUrlsRestoreSnapshot } from '../commands/RestoreOpenedUrlsSnapshotCommand'
import type { DeletedSavedUrlDto } from '../dto/DeletedSavedUrlDto'

/**
 * `DeleteSavedUrlUseCase` が依存する repository 群。
 */
export interface DeleteSavedUrlUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `DeleteSavedUrlUseCase` の関数型。
 */
export type DeleteSavedUrlUseCase = (
  command: DeleteSavedUrlCommand,
) => Promise<DeletedSavedUrlDto>

/**
 * `DeleteSavedUrlUseCase` を生成する。
 *
 * 責務:
 * 1. 対象 `TabGroup` を取得する。見つからなければ `SavedTabsDomainError` を投げる。
 * 2. URL 文字列から `UrlRecord` を逆引きする。見つからなければ
 *    `SavedTabsDomainError` を投げる。
 * 3. 該当 `UrlRecordId` を `TabGroup` の `urlIds` から取り除く。
 *    `urlIds` が空になった場合は `TabGroup` 自体を削除する。
 * 4. 該当 `UrlRecord` が他で参照されていなければ `UrlRecordRepository.removeByIds` で削除する。
 * 5. Undo 用 snapshot を `DeletedSavedUrlDto` にまとめて返す。
 *
 * 1 件も `UrlRecord` が消せず `TabGroup` も変更なしのケースでは
 * `snapshot: null` を返す。
 */
export const createDeleteSavedUrlUseCase = (
  deps: DeleteSavedUrlUseCaseDeps,
): DeleteSavedUrlUseCase => {
  return async (command) => {
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

    const targetUrlRecord = allUrlRecords.find(
      (record) => record.url === command.url,
    )
    if (!targetUrlRecord) {
      throw new SavedTabsDomainError(
        '削除対象の UrlRecord が見つかりません',
        'URL_RECORD_NOT_FOUND',
      )
    }

    const targetUrlId: UrlRecordId = targetUrlRecord.id
    const isReferencedInGroup = targetGroup.urlIds.includes(targetUrlId)
    if (!isReferencedInGroup) {
      // 対象 TabGroup に該当 URL が無い場合は no-op。
      return {
        removedTabGroupId: null,
        removedUrlRecord: null,
        removedUrlRecordId: null,
        snapshot: null,
      }
    }

    const previousGroup: TabGroup = targetGroup
    const previousUrlRecord: UrlRecord = targetUrlRecord

    // 該当 URL を TabGroup から取り除く。
    const remainingUrlIds = targetGroup.urlIds.filter(
      (urlId) => urlId !== targetUrlId,
    )
    const isGroupEmpty = remainingUrlIds.length === 0
    const updatedGroups = isGroupEmpty
      ? allTabGroups.filter((group) => group.id !== targetGroup.id)
      : allTabGroups.map((group) =>
          group.id === targetGroup.id
            ? { ...group, urlIds: remainingUrlIds }
            : group,
        )

    // UrlRecord が他で参照されていなければ削除する。
    const stillReferenced = isUrlRecordReferencedElsewhere({
      customProjects: allCustomProjects,
      origin: { id: targetGroup.id, kind: 'tabGroup' },
      tabGroups: isGroupEmpty ? [] : updatedGroups,
      urlRecordId: targetUrlId,
    })

    if (
      updatedGroups.length !== allTabGroups.length ||
      updatedGroups.some((group, index) => group !== allTabGroups[index])
    ) {
      await deps.tabGroupRepository.saveAll(updatedGroups)
    }

    let removedUrlRecordId: UrlRecordId | null = null
    if (!stillReferenced) {
      await deps.urlRecordRepository.removeByIds([targetUrlId])
      removedUrlRecordId = targetUrlId
    }

    const removedUrlRecord: UrlRecord | null =
      removedUrlRecordId !== null ? previousUrlRecord : null

    if (removedUrlRecordId === null && !isGroupEmpty) {
      // 副作用なし（参照中 URL を TabGroup からも外せなかった）ので snapshot 不要。
      return {
        removedTabGroupId: null,
        removedUrlRecord: null,
        removedUrlRecordId: null,
        snapshot: null,
      }
    }

    const snapshot: OpenedUrlsRestoreSnapshot = {
      customProjectOrder: undefined,
      customProjects: undefined,
      parentCategories: undefined,
      savedTabs: isGroupEmpty ? [previousGroup] : [],
      urlRecords: removedUrlRecord ? [previousUrlRecord] : [],
    }

    return {
      removedTabGroupId: isGroupEmpty ? previousGroup.id : null,
      removedUrlRecord,
      removedUrlRecordId,
      snapshot,
    }
  }
}
