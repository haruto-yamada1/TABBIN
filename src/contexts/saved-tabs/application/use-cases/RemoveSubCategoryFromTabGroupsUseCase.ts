import type { TabGroup } from '../../domain/entities/TabGroup'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import { removeSubCategoryFromGroup } from '../../domain/services/TabGroupSubCategoryRemovalService'
import type {
  RemoveSubCategoryFromTabGroupsCommand,
  RemoveSubCategoryFromTabGroupsResult,
} from '../commands/RemoveSubCategoryFromTabGroupsCommand'

/**
 * `RemoveSubCategoryFromTabGroupsUseCase` が依存する repository 群。
 *
 * テスト時は in-memory mock を注入する。`chrome.storage.local` への
 * 依存を排除した unit test を書けるように、interface のみを公開する。
 */
export interface RemoveSubCategoryFromTabGroupsUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
}

/**
 * `RemoveSubCategoryFromTabGroupsUseCase` の関数型。
 *
 * presentation / controller hook 側は `use-case` を直接 import せず、
 * composition 層で生成した関数を受け取って呼び出す形を推奨。
 */
export type RemoveSubCategoryFromTabGroupsUseCase = (
  command: RemoveSubCategoryFromTabGroupsCommand,
) => Promise<RemoveSubCategoryFromTabGroupsResult>

/**
 * `RemoveSubCategoryFromTabGroupsUseCase` を生成する。
 *
 * 責務:
 * 1. 受け取った `tabGroups` に対し、pure な
 *    `removeSubCategoryFromGroup` (domain service) を適用する。
 *    入力は storage 層 `TabGroup` の widening interface
 *    (`SubCategoryDeletableTabGroup`) として domain service に渡せる
 *    ため、 structural な widening キャストだけで済む。
 * 2. 更新後の配列を `tabGroupRepository.saveAll` に委譲する
 *    （storage 層 → domain entity への branded キャストは既存
 *    use-case 群と同じパターン）。
 *
 * 旧 `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleDeleteCategory` 内に残っていた `removeSubCategoryFromGroup`
 * 呼び出しと `categoryAssignmentPort.saveTabGroups` 直叩きを
 * use-case 経由へ置換する (issue #519)。
 */
export const createRemoveSubCategoryFromTabGroupsUseCase = (
  deps: RemoveSubCategoryFromTabGroupsUseCaseDeps,
): RemoveSubCategoryFromTabGroupsUseCase => {
  return async (command) => {
    const updatedTabGroups: readonly TabGroup[] = command.tabGroups.map(
      (group) =>
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- domain `TabGroup` ↔ storage `TabGroup` branded 差異
        removeSubCategoryFromGroup(
          group,
          command.groupId,
          command.categoryName,
        ) as unknown as TabGroup,
    )
    await deps.tabGroupRepository.saveAll(updatedTabGroups)
    return {
      tabGroups:
        updatedTabGroups as unknown as RemoveSubCategoryFromTabGroupsResult['tabGroups'], // eslint-disable-line typescript/no-unsafe-type-assertion -- domain `TabGroup` ↔ storage `TabGroup` branded 差異
    }
  }
}
