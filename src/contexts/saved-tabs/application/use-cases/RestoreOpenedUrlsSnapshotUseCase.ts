import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { RestoreOpenedUrlsSnapshotCommand } from '../commands/RestoreOpenedUrlsSnapshotCommand'
import type { RestoredSnapshotDto } from '../dto/RestoredSnapshotDto'

/**
 * `RestoreOpenedUrlsSnapshotUseCase` が依存する repository 群。
 *
 * `ParentCategoryRepository` もオプション扱いとし、snapshot に
 * `parentCategories` が含まれる場合のみ保存する。
 */
export interface RestoreOpenedUrlsSnapshotUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `RestoreOpenedUrlsSnapshotUseCase` の関数型。
 */
export type RestoreOpenedUrlsSnapshotUseCase = (
  command: RestoreOpenedUrlsSnapshotCommand,
) => Promise<RestoredSnapshotDto>

/**
 * `RestoreOpenedUrlsSnapshotUseCase` を生成する。
 *
 * 責務:
 * 1. snapshot の各フィールドを読み、含まれていれば repository へ書き戻す。
 * 2. 書き戻した内容を `RestoredSnapshotDto` にまとめて返す。
 *
 * マージ戦略:
 * - `savedTabs` / `urlRecords` / `customProjects` については、
 *   snapshot の内容を **既存データへ追加** する（ID 重複は snapshot 優先）。
 * - `parentCategories` は `saveAll` で全置換する（カテゴリは集合として扱う）。
 * - `customProjectOrder` は repository interface がないため、現状は DTO へ
 *   そのまま載せず、presentation 層で `chrome.storage.local` へ書き戻す
 *   拡張は別 issue に切り出す。
 *
 * この use-case は冪等ではなく、Undo ボタンが押されるたびに
 * 同じ snapshot を適用する想定。複数回押された場合は
 * 「同一 TabGroup / UrlRecord が二重追加」になる可能性があるが、
 * 呼び出し側で 1 回だけ発火する責務とする。
 */
export const createRestoreOpenedUrlsSnapshotUseCase = (
  deps: RestoreOpenedUrlsSnapshotUseCaseDeps,
): RestoreOpenedUrlsSnapshotUseCase => {
  return async (command) => {
    const { snapshot } = command
    const restoredTabGroups = snapshot.savedTabs ?? []
    const restoredUrlRecords = snapshot.urlRecords ?? []
    const restoredCustomProjects = snapshot.customProjects ?? []
    const restoredParentCategories = snapshot.parentCategories ?? []

    if (snapshot.savedTabs && snapshot.savedTabs.length > 0) {
      const existing = await deps.tabGroupRepository.findAll()
      const incomingIds = new Set(snapshot.savedTabs.map((group) => group.id))
      const merged = [
        ...existing.filter((group) => !incomingIds.has(group.id)),
        ...snapshot.savedTabs,
      ]
      await deps.tabGroupRepository.saveAll(merged)
    }

    if (snapshot.urlRecords && snapshot.urlRecords.length > 0) {
      const existing = await deps.urlRecordRepository.findAll()
      const incomingIds = new Set(
        snapshot.urlRecords.map((record) => record.id),
      )
      const merged = [
        ...existing.filter((record) => !incomingIds.has(record.id)),
        ...snapshot.urlRecords,
      ]
      await deps.urlRecordRepository.saveAll(merged)
    }

    if (snapshot.customProjects && snapshot.customProjects.length > 0) {
      const existing = await deps.customProjectRepository.findAll()
      const incomingIds = new Set(
        snapshot.customProjects.map((project) => project.id),
      )
      const merged = [
        ...existing.filter((project) => !incomingIds.has(project.id)),
        ...snapshot.customProjects,
      ]
      await deps.customProjectRepository.saveAll(merged)
    }

    if (snapshot.parentCategories && snapshot.parentCategories.length > 0) {
      await deps.parentCategoryRepository.saveAll(snapshot.parentCategories)
    }

    return {
      restoredCustomProjects,
      restoredParentCategories,
      restoredTabGroups,
      restoredUrlRecords,
    }
  }
}
