import { setCategoryKeywords } from '@/lib/storage/tabs'

import type { SetCategoryKeywordsPort } from '../../../application/ports/SetCategoryKeywordsPort'

/**
 * `setCategoryKeywordsPort` の chrome / lib/storage ハイブリッド adapter。
 *
 * 旧 `src/lib/storage/tabs.setCategoryKeywords` を呼び出す薄いラッパー。
 * port 仕様としては「副作用は port 内部で完結」「atomic 保証」を
 * 維持する（旧 `persistBulkDeleteForGroup` 相当の save + rollback）。
 *
 * なぜ chrome ではなく lib 経由にするのか:
 * - 旧 `setCategoryKeywords` は `tabGroup`（rich 補助フィールド持ち）と
 *   `domainCategorySettings`（別 storage key）の 2 箇所を更新し、
 *   さらに `urlSubCategories` を再計算する一連の副作用を 1 関数で
 *   atomic に処理している。
 * - `TabGroupRepository.saveAll` 経由では `categoryKeywords`（rich
 *   補助フィールド）を書き換える手段がない。
 * - chrome.storage.local レベルの port を作って adapter から直接
 *   読み書きしてもいいが、既存挙動の保全と「同じ storage スキーマ・
 *   migration を変えない」要件（issue #501 受け入れ条件）を満たす
 *   ために lib 経由のラッパーに留める。
 *
 * issue #501 で `setCategoryKeywords` を use-case 経由へ移設するため新設。
 */
export const createLibSetCategoryKeywordsAdapter =
  (): SetCategoryKeywordsPort => {
    return {
      setCategoryKeywords: async (tabGroupId, categoryName, keywords) => {
        await setCategoryKeywords(tabGroupId, categoryName, [...keywords])
      },
    }
  }
