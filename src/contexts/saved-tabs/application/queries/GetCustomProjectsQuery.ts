import type { CustomProject } from '../../domain/entities/CustomProject'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'

/**
 * presentation 層が「`CustomProject` ドメイン entity の生一覧」を
 * 必要とするときの application query (issue #538)。
 *
 * 旧 `useProjectManagement` 内の `customProjectRepository.findAll()`
 * 直叩きを、application query 経由へ寄せるラッパ。`getCustomProjectRawsQuery`
 * とは戻り値 shape が異なり、entity 形 (`CustomProject`) と raw
 * snapshot 形 (`CustomProjectRawSnapshot`) のどちらが必要かで
 * 呼び分けられる。
 *
 * 純粋な read-only query。state は持たず、副作用は
 * `customProjectRepository.findAll()` 呼び出しのみ。
 */
export type GetCustomProjectsQuery = () => Promise<readonly CustomProject[]>

/**
 * `GetCustomProjectsQuery` が依存する repository 群。
 */
export interface GetCustomProjectsQueryDeps {
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `GetCustomProjectsQuery` を生成する。
 *
 * 責務は `customProjectRepository.findAll()` を呼び出して
 * `readonly CustomProject[]` を返すだけ。shape 変換や
 * 並び替えは行わない。
 *
 * @example
 * ```ts
 * const getCustomProjects = createGetCustomProjectsQuery({
 *   customProjectRepository,
 * })
 * const projects = await getCustomProjects()
 * ```
 */
export const createGetCustomProjectsQuery = (
  deps: GetCustomProjectsQueryDeps,
): GetCustomProjectsQuery => {
  return async () => deps.customProjectRepository.findAll()
}
