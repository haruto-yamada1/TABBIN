import type { CustomProject } from '../entities/CustomProject'
import type { CustomProjectId } from '../value-objects/CustomProjectId'

/**
 * `CustomProject` の永続化責務だけを抽出した repository interface。
 *
 * プロジェクト単位での URL 集約 (`urlIds` / `categories` / `createdAt` /
 * `updatedAt`) の読み書きと、表示順 (`order`) の読み書きだけを
 * domain interface に閉じ込める。並び替え・カテゴリ追加・URL 追加などは
 * use-case 側で表現する。
 *
 * `order` は `CustomProject` 集合とは独立した「表示用の並び順」であり、
 * 同じ ID を持つ `CustomProject` が storage 上から消えても `order` の
 * エントリは残ってよい。presentation 層は order を手掛かりに
 * `CustomProject` 配列を stable sort し、未知 ID は末尾へ送る / 無視する
 * などのフォールバックを行う。`saveOrder` は生 ID 配列をそのまま保存する
 * 素のマッピングに留め、storage key との対応は実装側に閉じる。
 *
 * `chrome.storage.local` の直接アクセスは禁止。実装は
 * `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/` 側に置く。
 *
 * @example
 * ```ts
 * const projects = await customProjectRepository.findAll()
 * const order = await customProjectRepository.findOrder()
 * const target = projects.find((project) => project.id === projectId)
 * ```
 */
export interface CustomProjectRepository {
  findAll: () => Promise<readonly CustomProject[]>
  findById: (id: CustomProjectId) => Promise<CustomProject | null>
  saveAll: (projects: readonly CustomProject[]) => Promise<void>
  removeByIds: (ids: readonly CustomProjectId[]) => Promise<void>
  findOrder: () => Promise<readonly CustomProjectId[]>
  saveOrder: (order: readonly CustomProjectId[]) => Promise<void>
}
