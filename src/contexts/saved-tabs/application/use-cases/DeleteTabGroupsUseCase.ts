import type { TabGroup } from '../../domain/entities/TabGroup'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { filterUnreferencedUrlRecords } from '../../domain/services/UrlReferenceService'
import type { TabGroupId } from '../../domain/value-objects/TabGroupId'
import type { DeleteTabGroupsCommand } from '../commands/DeleteTabGroupsCommand'
import type { OpenedUrlsRestoreSnapshot } from '../commands/RestoreOpenedUrlsSnapshotCommand'
import type { DeletedTabGroupsDto } from '../dto/DeletedTabGroupsDto'

/**
 * `DeleteTabGroupsUseCase` が依存する repository 群。
 */
export interface DeleteTabGroupsUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `DeleteTabGroupsUseCase` の関数型。
 */
export type DeleteTabGroupsUseCase = (
  command: DeleteTabGroupsCommand,
) => Promise<DeletedTabGroupsDto>

/**
 * `DeleteTabGroupsUseCase` を生成する。
 *
 * 責務:
 * 1. 入力 `tabGroupIds` に対応する `TabGroup` を取得する。storage 上に
 *    見つからない ID は無視する（1 件も見つからない場合は
 *    `DeletedTabGroupNotFoundError` ではなく、空の `removedTabGroupIds` を返す
 *    no-op として扱う）。
 * 2. 削除後にどの `TabGroup` / `CustomProject` からも参照されなくなる
 *    `UrlRecordId` を `filterUnreferencedUrlRecords` で抽出する。
 *    他の集約から参照されている `UrlRecord` は削除しない。
 * 3. 対象 `TabGroup` を `TabGroupRepository.removeByIds` で削除する。
 * 4. 未参照になった `UrlRecord` を `UrlRecordRepository.removeByIds` で削除する。
 *    削除対象が 0 件のときは repository を呼ばない。
 * 5. Undo 用 snapshot を `DeletedTabGroupsDto` にまとめて返す。
 *
 * `CustomProjectRepository` は参照判定にだけ使い、書き込みはしない
 * （CustomProject 側の参照は `TabGroup` 削除では変わらないため）。
 */
export const createDeleteTabGroupsUseCase = (
  deps: DeleteTabGroupsUseCaseDeps,
): DeleteTabGroupsUseCase => {
  return async (command) => {
    if (command.tabGroupIds.length === 0) {
      return {
        removedTabGroupIds: [],
        removedUrlRecordIds: [],
        snapshot: {
          customProjectOrder: undefined,
          customProjects: undefined,
          parentCategories: undefined,
          savedTabs: [],
          urlRecords: [],
        },
      }
    }

    const [allTabGroups, allUrlRecords, allCustomProjects] = await Promise.all([
      deps.tabGroupRepository.findAll(),
      deps.urlRecordRepository.findAll(),
      deps.customProjectRepository.findAll(),
    ])

    const targetIdSet = new Set<TabGroupId>(command.tabGroupIds)
    const targetGroups: TabGroup[] = allTabGroups.filter((group) =>
      targetIdSet.has(group.id),
    )
    if (targetGroups.length === 0) {
      throw new SavedTabsDomainError(
        '削除対象の TabGroup が見つかりません',
        'TAB_GROUP_NOT_FOUND',
      )
    }

    const targetGroupIds = new Set(targetGroups.map((group) => group.id))
    const remainingTabGroups = allTabGroups.filter(
      (group) => !targetGroupIds.has(group.id),
    )

    const urlRecordsInTarget = allUrlRecords.filter((record) =>
      targetGroups.some((group) => group.urlIds.includes(record.id)),
    )
    const unreferenced = filterUnreferencedUrlRecords({
      customProjects: allCustomProjects,
      tabGroups: remainingTabGroups,
      urlRecords: urlRecordsInTarget,
    })
    const removedUrlRecordIds = unreferenced.map((record) => record.id)

    await deps.tabGroupRepository.removeByIds(
      targetGroups.map((group) => group.id),
    )
    if (removedUrlRecordIds.length > 0) {
      await deps.urlRecordRepository.removeByIds(removedUrlRecordIds)
    }

    const removedUrlRecords = allUrlRecords.filter((record) =>
      removedUrlRecordIds.includes(record.id),
    )

    const snapshot: OpenedUrlsRestoreSnapshot & {
      readonly savedTabs: readonly TabGroup[]
    } = {
      customProjectOrder: undefined,
      customProjects: undefined,
      parentCategories: undefined,
      savedTabs: targetGroups,
      urlRecords: removedUrlRecords,
    }

    return {
      removedTabGroupIds: targetGroups.map((group) => group.id),
      removedUrlRecordIds,
      snapshot,
    }
  }
}
