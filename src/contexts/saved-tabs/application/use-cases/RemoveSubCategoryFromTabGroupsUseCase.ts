import type {
  RemoveSubCategoryFromTabGroupsCommand,
  RemoveSubCategoryFromTabGroupsResult,
} from '../commands/RemoveSubCategoryFromTabGroupsCommand'
import type { RemoveSubCategoryFromTabGroupPort } from '../ports/RemoveSubCategoryFromTabGroupPort'

/**
 * `RemoveSubCategoryFromTabGroupsUseCase` が依存する port 群。
 *
 * テスト時は in-memory port mock を注入する。 `chrome.storage.local`
 * への依存を排除した unit test を書けるように、 port interface のみ
 * を公開する。
 */
export interface RemoveSubCategoryFromTabGroupsUseCaseDeps {
  readonly removeSubCategoryFromTabGroupPort: RemoveSubCategoryFromTabGroupPort
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
 * 1. `removeSubCategoryFromTabGroupPort.removeSubCategoryFromTabGroup`
 *    を呼び出して、 対象 `TabGroup` の subCategories /
 *    urlSubCategories / categoryKeywords を削除して永続化する。
 * 2. port の戻り値 (更新後 `TabGroup[]`) を presentation 層へ
 *    そのまま返す。
 *
 * 旧 `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleDeleteCategory` 内に残っていた
 * `removeSubCategoryFromGroup` 呼び出しと
 * `categoryAssignmentPort.saveTabGroups` 直叩きを use-case 経由へ
 * 置換する (issue #519)。
 *
 * port 経由にする理由:
 * - domain `TabGroup` エンティティは rich 補助フィールド
 *   (`subCategories` / `urlSubCategories` / `categoryKeywords`) を
 *   持たないため、 `tabGroupRepository.saveAll` 経由では rich フィー
 *   ルドの更新を永続化できない (mapper が original の rich フィール
 *   ドを保持してしまう) 既存問題がある。 port に raw レベル更新を
 *   集約することで、 use-case の責務をシンプルに保ちつつ永続化
 *   ギャップを解消する (issue #519 Codex レビュー P1)。
 */
export const createRemoveSubCategoryFromTabGroupsUseCase = (
  deps: RemoveSubCategoryFromTabGroupsUseCaseDeps,
): RemoveSubCategoryFromTabGroupsUseCase => {
  return async (command) => {
    const tabGroups =
      await deps.removeSubCategoryFromTabGroupPort.removeSubCategoryFromTabGroup(
        command.groupId,
        command.categoryName,
      )
    return { tabGroups }
  }
}
