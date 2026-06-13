import type { CustomProject } from '../entities/CustomProject'
import type { CustomProjectId } from '../value-objects/CustomProjectId'

/**
 * `CustomProject` の永続化責務だけを抽出した repository interface。
 *
 * プロジェクト単位での URL 集約 (`urlIds` / `categories` / `createdAt` /
 * `updatedAt`) の読み書きだけを domain interface に閉じ込め、
 * 並び替え・カテゴリ追加・URL 追加などは use-case 側で表現する。
 *
 * `chrome.storage.local` の直接アクセスは禁止。実装は
 * `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/` 側に置く。
 *
 * @example
 * ```ts
 * const projects = await customProjectRepository.findAll()
 * const target = projects.find((project) => project.id === projectId)
 * ```
 */
export interface CustomProjectRepository {
  findAll: () => Promise<readonly CustomProject[]>
  findById: (id: CustomProjectId) => Promise<CustomProject | null>
  saveAll: (projects: readonly CustomProject[]) => Promise<void>
  removeByIds: (ids: readonly CustomProjectId[]) => Promise<void>
}
