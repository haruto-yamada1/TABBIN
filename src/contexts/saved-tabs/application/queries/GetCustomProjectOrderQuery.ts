import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

/**
 * presentation 層が「`CustomProject` の表示順 (ID 配列)」を必要とするときの
 * application query (issue #538)。
 *
 * 旧 `useProjectManagement` 内の `customProjectRepository.findOrder()`
 * 直叩きを、application query 経由へ寄せるラッパ。`getSavedTabsQuery` と
 * 同じ「`Repository.findX` への 1 メソッドブリッジ」パターンで、
 * presentation 層が `CustomProjectRepository` を import する経路を
 * 閉じる。
 *
 * 戻り値の `readonly CustomProjectId[]` は domain value-object の
 * branded 型を維持し、presentation 層で `string` 配列として扱いたい
 * 場合は呼び出し側で widen する。
 */
export type GetCustomProjectOrderQuery = () => Promise<readonly string[]>

/**
 * `GetCustomProjectOrderQuery` が依存する repository 群。
 */
export type GetCustomProjectOrderQueryDeps = {
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `GetCustomProjectOrderQuery` を生成する。
 *
 * 責務は `customProjectRepository.findOrder()` を呼び出して
 * `readonly CustomProjectId[]` を返すだけ。
 *
 * @example
 * ```ts
 * const getCustomProjectOrder = createGetCustomProjectOrderQuery({
 *   customProjectRepository,
 * })
 * const order = await getCustomProjectOrder()
 * ```
 */
export const createGetCustomProjectOrderQuery = (
  deps: GetCustomProjectOrderQueryDeps,
): GetCustomProjectOrderQuery => {
  return async () =>
    (await deps.customProjectRepository.findOrder()).map(String)
}
