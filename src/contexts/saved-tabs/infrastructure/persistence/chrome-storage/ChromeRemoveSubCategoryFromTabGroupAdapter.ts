import { removeSubCategoryFromTabGroup } from '@/lib/storage/tabs'

import type { RemoveSubCategoryFromTabGroupPort } from '../../../application/ports/RemoveSubCategoryFromTabGroupPort'

/**
 * `removeSubCategoryFromTabGroupPort` の lib/storage 経由 adapter
 * (issue #519)。
 *
 * 旧 `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleDeleteCategory` 内に残っていた
 * `removeSubCategoryFromGroup` pure logic + raw 永続化を port 経由
 * へ移すために新設。
 *
 * `SetCategoryKeywordsPort` の `createLibSetCategoryKeywordsAdapter`
 * (issue #501) と同じ「 rich 補助フィールド更新は port に閉じ込める」
 * 方針を踏襲し、 lib 経由のラッパーに留める。
 *
 * なぜ chrome ではなく lib 経由にするのか:
 * - `tabGroupRepository.saveAll` 経由では rich 補助フィールド
 *   (`subCategories` / `urlSubCategories` / `categoryKeywords`) を
 *   書き換える手段がない (mapper が original の rich フィールドを
 *   保持してしまう既存問題、 issue #519 Codex レビュー P1)。
 * - lib/storage レベルの関数として実装することで、 既存 storage
 *   スキーマと migration を変えず、 presentation 層からの呼び出し
 *   経路だけを port 経由へ切り替えられる。
 */
export const createLibRemoveSubCategoryFromTabGroupAdapter =
  (): RemoveSubCategoryFromTabGroupPort => {
    return {
      removeSubCategoryFromTabGroup: (groupId, categoryName) => {
        return removeSubCategoryFromTabGroup(groupId, categoryName)
      },
    }
  }
