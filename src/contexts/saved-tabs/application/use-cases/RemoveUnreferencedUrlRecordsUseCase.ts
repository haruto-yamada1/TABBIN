import type { RemovedUrlRecordsDto } from '@/contexts/saved-tabs/application/dto/RemovedUrlRecordsDto'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { filterUnreferencedUrlRecords } from '@/contexts/saved-tabs/domain/services/UrlReferenceService'

/**
 * `RemoveUnreferencedUrlRecordsUseCase` が依存する repository 群。
 */
export type RemoveUnreferencedUrlRecordsUseCaseDeps = {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `RemoveUnreferencedUrlRecordsUseCase` の関数型。
 */
export type RemoveUnreferencedUrlRecordsUseCase =
  () => Promise<RemovedUrlRecordsDto>

/**
 * `RemoveUnreferencedUrlRecordsUseCase` を生成する。
 *
 * 責務:
 * 1. 全ての `UrlRecord` / `TabGroup` / `CustomProject` を取得する。
 * 2. `filterUnreferencedUrlRecords` で参照されていない `UrlRecord` を抽出する。
 * 3. 抽出したレコードを `UrlRecordRepository.removeByIds` で削除する。
 * 4. 件数と ID 一覧を DTO で返す。
 *
 * 単体利用だけでなく、`DeleteTabGroupUseCase` 内蔵の掃除と
 * 同じロジックを「任意のタイミングで」発火させる UI コマンド
 * （「未参照 URL を整理」など）から呼び出す。
 */
export const createRemoveUnreferencedUrlRecordsUseCase = (
  deps: RemoveUnreferencedUrlRecordsUseCaseDeps,
): RemoveUnreferencedUrlRecordsUseCase => {
  return async () => {
    const [allUrlRecords, allTabGroups, allCustomProjects] = await Promise.all([
      deps.urlRecordRepository.findAll(),
      deps.tabGroupRepository.findAll(),
      deps.customProjectRepository.findAll(),
    ])

    const unreferenced = filterUnreferencedUrlRecords({
      customProjects: allCustomProjects,
      tabGroups: allTabGroups,
      urlRecords: allUrlRecords,
    })
    if (unreferenced.length === 0) {
      return { removedCount: 0, removedUrlRecordIds: [] }
    }

    const removedUrlRecordIds = unreferenced.map((record) => record.id)
    await deps.urlRecordRepository.removeByIds(removedUrlRecordIds)
    return { removedCount: unreferenced.length, removedUrlRecordIds }
  }
}
