import type { DeleteTabGroupCommand } from '@/contexts/saved-tabs/application/commands/DeleteTabGroupCommand'
import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { DeletedTabGroupDto } from '@/contexts/saved-tabs/application/dto/DeletedTabGroupDto'
import {
  toSavedTabsTabGroupDto,
  toSavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { filterUnreferencedUrlRecords } from '@/contexts/saved-tabs/domain/services/UrlReferenceService'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * `DeleteTabGroupUseCase` が依存する repository 群。
 *
 * テスト時は in-memory mock を注入する。`chrome.storage.local` への
 * 依存を排除した unit test を書けるように、interface のみを公開する。
 */
export type DeleteTabGroupUseCaseDeps = {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `DeleteTabGroupUseCase` の関数型。
 *
 * presentation / controller hook 側は `use-case` を直接 import せず、
 * composition 層で生成した関数を受け取って呼び出す形を推奨。
 */
export type DeleteTabGroupUseCase = (
  command: DeleteTabGroupCommand,
) => Promise<DeletedTabGroupDto>

/**
 * `DeleteTabGroupUseCase` を生成する。
 *
 * 責務:
 * 1. 対象 `TabGroup` を取得する。見つからなければ `SavedTabsDomainError` を投げる。
 * 2. 削除後にどの `TabGroup` / `CustomProject` からも参照されなくなる
 *    `UrlRecordId` を `filterUnreferencedUrlRecords` で抽出する。
 *    他の集約から参照されている `UrlRecord` は削除しない。
 * 3. 対象 `TabGroup` を `TabGroupRepository.removeByIds` で削除する。
 * 4. 未参照になった `UrlRecord` を `UrlRecordRepository.removeByIds` で削除する。
 * 5. Undo 用 snapshot を `DeletedTabGroupDto` にまとめて返す。
 *
 * `CustomProjectRepository` は参照判定にだけ使い、書き込みはしない
 * （CustomProject 側の参照は `TabGroup` 削除では変わらないため）。
 */
export const createDeleteTabGroupUseCase = (
  deps: DeleteTabGroupUseCaseDeps,
): DeleteTabGroupUseCase => {
  return async (command) => {
    const tabGroupId = createTabGroupId(command.tabGroupId)
    const [allTabGroups, allUrlRecords, allCustomProjects] = await Promise.all([
      deps.tabGroupRepository.findAll(),
      deps.urlRecordRepository.findAll(),
      deps.customProjectRepository.findAll(),
    ])

    const targetGroup = allTabGroups.find((group) => group.id === tabGroupId)
    if (!targetGroup) {
      throw new SavedTabsDomainError(
        '削除対象の TabGroup が見つかりません',
        'TAB_GROUP_NOT_FOUND',
      )
    }

    const remainingTabGroups = allTabGroups.filter(
      (group) => group.id !== targetGroup.id,
    )
    const urlRecordsInTarget = allUrlRecords.filter((record) =>
      targetGroup.memberships.some(({ urlId }) => urlId === record.id),
    )
    const unreferenced = filterUnreferencedUrlRecords({
      customProjects: allCustomProjects,
      tabGroups: remainingTabGroups,
      urlRecords: urlRecordsInTarget,
    })
    const removedUrlRecordIds = unreferenced.map((record) => record.id)

    const removedUrlRecords = allUrlRecords.filter((record) =>
      removedUrlRecordIds.includes(record.id),
    )

    await deps.tabGroupRepository.removeByIds([targetGroup.id])
    if (removedUrlRecordIds.length > 0) {
      await deps.urlRecordRepository.removeByIds(removedUrlRecordIds)
    }

    const snapshot: OpenedUrlsRestoreSnapshot = {
      savedTabs: [toSavedTabsTabGroupDto(targetGroup)],
      urlRecords: removedUrlRecords.map(toSavedTabsUrlRecordDto),
    }

    return {
      removedTabGroupId: targetGroup.id,
      removedUrlRecordIds,
      snapshot,
    }
  }
}
