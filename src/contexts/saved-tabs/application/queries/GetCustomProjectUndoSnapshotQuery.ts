import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'

/**
 * undo 用途の `CustomProject` 読み取りスナップショット (issue #538)。
 *
 * - `customProjectOrder`: 削除直前の `customProjectOrder`。
 * - `customProjects`: `findAll()` (entity 経路) で取得した entity 一覧。
 * - `customProjectsRaw`: `findAllRaw()` (raw 経路) で取得した snapshot
 *   一覧。rich フィールド (`urls` / `urlMetadata` / `projectKeywords` /
 *   `categoryOrder`) を保持する。
 *
 * それぞれ「該当データが存在しない」場合に省略される optional フィールド。
 * `RestoreCustomProjectsSnapshotUseCase` 側で payload 化してから
 * `customProjectRepository.restoreAllRaw` / `saveAll` に渡す。
 */
export interface CustomProjectUndoSnapshot {
  customProjectOrder?: readonly CustomProjectId[]
  customProjects?: readonly CustomProject[]
  customProjectsRaw?: readonly CustomProjectRawSnapshot[]
}

/**
 * presentation 層が undo 用途に「`CustomProject` 表示順 + entity +
 * raw snapshot」を一括取得するときの application query (issue #538)。
 *
 * 旧 `useProjectManagement.getCustomProjectUndoSnapshot` (private
 * helper) の責務を application query として切り出す。`findOrder` と
 * `findAllRaw` (`findAll` フォールバック) を 1 関数に束ね、
 * presentation 層が「order / entity / raw を別々に取得して組み立てる」
 * ロジックを持つ必要をなくす。
 *
 * 旧実装と異なり、`customProjectOrder` は array length > 0 のときだけ
 * 設定する (空配列を payload 化すると `saveOrder([])` が誤って
 * 走ってしまうため)。
 */
export type GetCustomProjectUndoSnapshotQuery =
  () => Promise<CustomProjectUndoSnapshot>

/**
 * `GetCustomProjectUndoSnapshotQuery` が依存する repository 群。
 */
export interface GetCustomProjectUndoSnapshotQueryDeps {
  readonly customProjectRepository: CustomProjectRepository
}

const entityFromRaw = (raw: CustomProjectRawSnapshot): CustomProject =>
  createCustomProject({
    categories: raw.categories,
    createdAt: raw.createdAt,
    id: raw.id,
    name: raw.name,
    updatedAt: raw.updatedAt,
    urlIds: raw.urlIds ?? [],
  })

/**
 * `GetCustomProjectUndoSnapshotQuery` を生成する。
 *
 * 責務:
 * 1. `customProjectRepository.findOrder()` で order を取得
 * 2. `findAllRaw` 実装があればそれを使い、raw snapshot と entity 形を
 *    両方返す (issue #535 P1: rich フィールド保持)
 * 3. `findAllRaw` 未実装の legacy repository では `findAll()` (entity)
 *    だけでフォールバックする
 *
 * @example
 * ```ts
 * const getCustomProjectUndoSnapshot = createGetCustomProjectUndoSnapshotQuery({
 *   customProjectRepository,
 * })
 * const snapshot = await getCustomProjectUndoSnapshot()
 * ```
 */
export const createGetCustomProjectUndoSnapshotQuery = (
  deps: GetCustomProjectUndoSnapshotQueryDeps,
): GetCustomProjectUndoSnapshotQuery => {
  return async (): Promise<CustomProjectUndoSnapshot> => {
    const order = await deps.customProjectRepository.findOrder()
    const base: CustomProjectUndoSnapshot =
      order.length > 0 ? { customProjectOrder: order } : {}
    if (deps.customProjectRepository.findAllRaw) {
      const raws = await deps.customProjectRepository.findAllRaw()
      const projects: CustomProject[] = raws.map(entityFromRaw)
      return {
        ...base,
        ...(projects.length > 0 ? { customProjects: projects } : {}),
        ...(raws.length > 0 ? { customProjectsRaw: raws } : {}),
      }
    }
    const projects = await deps.customProjectRepository.findAll()
    return {
      ...base,
      ...(projects.length > 0 ? { customProjects: projects } : {}),
    }
  }
}
