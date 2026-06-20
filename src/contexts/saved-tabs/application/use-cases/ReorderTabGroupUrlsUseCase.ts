import type { TabGroupDto } from '../../domain/dto/TabGroupDto'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { reorderTabGroupUrlIds } from '../../domain/services/TabGroupUrlReorderer'
import { createUrlRecordId } from '../../domain/value-objects/UrlRecordId'
import type { ReorderTabGroupUrlsCommand } from '../commands/ReorderTabGroupUrlsCommand'

/**
 * `ReorderTabGroupUrlsUseCase` が依存する repository 群。
 */
export interface ReorderTabGroupUrlsUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
}

/**
 * `ReorderTabGroupUrlsUseCase` の関数型。
 */
export type ReorderTabGroupUrlsUseCase = (
  command: ReorderTabGroupUrlsCommand,
) => Promise<void>

/**
 * `ReorderTabGroupUrlsUseCase` を生成する。
 *
 * 責務:
 * 1. `tabGroupRepository.findAll` で全 `TabGroup` を取得し、対象 group を探す。
 *    見つからなければ `SavedTabsDomainError` を投げる。
 * 2. `urlRecordRepository.findAll` で全 `UrlRecord` を取得し、
 *    `command.newUrlOrder`（URL 文字列配列）を `UrlRecordId` 配列へ
 *    逆引きする。
 * 3. `reorderTabGroupUrlIds` で新 `urlIds` 配列を組み立て、
 *    対象 group の `urlIds` だけを差し替える。
 * 4. `tabGroupRepository.saveAll` で全 group を書き戻す。
 *
 * 旧 `src/lib/storage/tabs.reorderTabGroupUrls` の domain 等価物。
 * issue #501 で presentation 層から `@/lib/storage/tabs` への
 * 直接依存を撤去するために新設。
 *
 * `@/types/storage` には依存せず、domain DTO `TabGroupDto` のみで
 * 動作する (issue #511)。
 */
export const createReorderTabGroupUrlsUseCase = (
  deps: ReorderTabGroupUrlsUseCaseDeps,
): ReorderTabGroupUrlsUseCase => {
  return async (command) => {
    const [allTabGroups, allUrlRecords] = await Promise.all([
      deps.tabGroupRepository.findAll(),
      deps.urlRecordRepository.findAll(),
    ])
    const targetIndex = allTabGroups.findIndex(
      (group) => group.id === command.tabGroupId,
    )
    if (targetIndex === -1) {
      throw new SavedTabsDomainError(
        '並び替え対象の TabGroup が見つかりません',
        'TAB_GROUP_NOT_FOUND',
      )
    }
    const targetGroup = allTabGroups[targetIndex]
    const dtoGroup: TabGroupDto = {
      id: targetGroup.id,
      domain: targetGroup.domain,
      urlIds: targetGroup.urlIds.map(String),
    }
    const reorderedUrlIds = reorderTabGroupUrlIds({
      group: dtoGroup,
      newUrlOrder: command.newUrlOrder,
      urlRecords: allUrlRecords,
    })
    const updatedGroups = allTabGroups.map((group, index) =>
      index === targetIndex
        ? {
            ...group,
            urlIds: reorderedUrlIds.map((id) => createUrlRecordId(id)),
          }
        : group,
    )
    await deps.tabGroupRepository.saveAll(updatedGroups)
  }
}
