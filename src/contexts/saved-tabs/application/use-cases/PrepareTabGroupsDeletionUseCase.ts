import type { PrepareTabGroupsDeletionCommand } from '@/contexts/saved-tabs/application/commands/PrepareTabGroupsDeletionCommand'

import { createPrepareTabGroupDeletionUseCase } from './PrepareTabGroupDeletionUseCase'
import type { PrepareTabGroupDeletionUseCaseDeps } from './PrepareTabGroupDeletionUseCase'

/**
 * `PrepareTabGroupsDeletionUseCase` が依存する repository / port 群。
 *
 * 単数の `PrepareTabGroupDeletionUseCase` と同じ interface。共通化のため
 * `PrepareTabGroupDeletionUseCaseDeps` を再エクスポートする。
 */
export type PrepareTabGroupsDeletionUseCaseDeps =
  PrepareTabGroupDeletionUseCaseDeps

/**
 * `PrepareTabGroupsDeletionUseCase` の関数型。
 *
 * presentation / controller hook 側は `use-case` を直接 import せず、
 * composition 層で生成した関数を受け取って呼び出す形を推奨。
 */
export type PrepareTabGroupsDeletionUseCase = (
  command: PrepareTabGroupsDeletionCommand,
) => Promise<void>

/**
 * `PrepareTabGroupsDeletionUseCase` を生成する。
 *
 * 責務 (issue #524):
 * 1. `tabGroupIds` が空なら no-op。
 * 2. 各 ID に対して `PrepareTabGroupDeletionUseCase` を順次呼び出す。
 *    旧 `tab-operations.handleTabGroupRemoval` を
 *    `Promise.all(ids.map(...))` で並列実行していた挙動を維持するため、
 *    内部で `Promise.all` を使う。
 *
 * 各 ID 単位の副作用 (`CategoriesCommandService` / 親カテゴリ
 * `domainNames` / `DomainCategoryMapping`) は
 * `PrepareTabGroupDeletionUseCase` 側に閉じ込めており、本 use-case は
 * orchestration だけを担う。削除本体は
 * `DeleteTabGroupsUseCase` 側に委譲する。
 */
export const createPrepareTabGroupsDeletionUseCase = (
  deps: PrepareTabGroupsDeletionUseCaseDeps,
): PrepareTabGroupsDeletionUseCase => {
  const prepareSingle = createPrepareTabGroupDeletionUseCase(deps)
  return async (command) => {
    if (command.tabGroupIds.length === 0) {
      return
    }
    await Promise.all(
      command.tabGroupIds.map(async (id) => prepareSingle({ tabGroupId: id })),
    )
  }
}
