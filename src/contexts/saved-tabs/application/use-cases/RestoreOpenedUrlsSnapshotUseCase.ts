import type { RestoreOpenedUrlsSnapshotCommand } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { RestoredSnapshotDto } from '@/contexts/saved-tabs/application/dto/RestoredSnapshotDto'
import {
  toCreateCustomProjectInput,
  toCreateTabGroupInput,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'

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
 * snapshot 内の `customProjectOrder` を検証して `CustomProjectId[]` へ
 * 正規化する。空文字や重複は破棄し、復元対象から外す。
 *
 * 旧 `presentation` 層で `chrome.storage.local.set({ customProjectOrder })`
 * を補助呼び出ししていた処理を repository 経由に置き換える（issue #487）。
 */
const normalizeCustomProjectOrder = (
  order: readonly string[] | undefined,
): readonly CustomProjectId[] | undefined => {
  if (!order) {
    return undefined
  }
  const result: CustomProjectId[] = []
  const seen = new Set<string>()
  for (const raw of order) {
    if (typeof raw !== 'string' || raw.length === 0) {
      continue
    }
    if (seen.has(raw)) {
      continue
    }
    seen.add(raw)
    result.push(createCustomProjectId(raw))
  }
  return result
}

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
 * - `customProjectOrder` は `customProjectRepository.saveOrder` で
 *   snapshot の値で **全置換** する。`order` は表示用並び順なので
 *   「既存に項目を残してマージ」する意味が薄く、Undo 押下時点の
 *   ユーザー期待は「snapshot 時点の表示順に戻る」ため、全置換が
 *   直感に合う（issue #487）。
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
    const restoredCustomProjectOrder = normalizeCustomProjectOrder(
      snapshot.customProjectOrder,
    )
    const restoredTabGroupEntities = restoredTabGroups
      .map(toCreateTabGroupInput)
      .map(createTabGroup)
    const restoredUrlRecordEntities = restoredUrlRecords.map(createUrlRecord)
    const restoredCustomProjectEntities = restoredCustomProjects
      .map(toCreateCustomProjectInput)
      .map(createCustomProject)
    const restoredParentCategoryEntities =
      restoredParentCategories.map(createParentCategory)

    if (restoredTabGroupEntities.length > 0) {
      const existing = await deps.tabGroupRepository.findAll()
      const incomingIds = new Set(
        restoredTabGroupEntities.map((group) => group.id),
      )
      const merged = [
        ...existing.filter((group) => !incomingIds.has(group.id)),
        ...restoredTabGroupEntities,
      ]
      await deps.tabGroupRepository.saveAll(merged)
    }

    if (restoredUrlRecordEntities.length > 0) {
      const existing = await deps.urlRecordRepository.findAll()
      const incomingIds = new Set(
        restoredUrlRecordEntities.map((record) => record.id),
      )
      const merged = [
        ...existing.filter((record) => !incomingIds.has(record.id)),
        ...restoredUrlRecordEntities,
      ]
      await deps.urlRecordRepository.saveAll(merged)
    }

    if (restoredCustomProjectEntities.length > 0) {
      const existing = await deps.customProjectRepository.findAll()
      const incomingIds = new Set(
        restoredCustomProjectEntities.map((project) => project.id),
      )
      const merged = [
        ...existing.filter((project) => !incomingIds.has(project.id)),
        ...restoredCustomProjectEntities,
      ]
      await deps.customProjectRepository.saveAll(merged)
    }

    if (restoredParentCategoryEntities.length > 0) {
      await deps.parentCategoryRepository.saveAll(
        restoredParentCategoryEntities,
      )
    }

    if (restoredCustomProjectOrder) {
      await deps.customProjectRepository.saveOrder(restoredCustomProjectOrder)
    }

    return {
      restoredCustomProjectOrder: restoredCustomProjectOrder?.map(String),
      restoredCustomProjects,
      restoredParentCategories,
      restoredTabGroups,
      restoredUrlRecords,
    }
  }
}
