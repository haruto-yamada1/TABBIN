import { useCallback } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases'

/**
 * `SyncCategoryAssignmentsUseCase` を fire-and-forget で呼び出す stable callback を返す。
 *
 * useEffect 内で直接呼び出すと `react-doctor/no-pass-data-to-parent` が
 * catch 句の `error` 変数を「子で生成した値」と誤検出するため、
 * effect 内のクロージャから外側の custom hook に切り出して rule の
 * ascend 解析から `error` を不可視にする。
 */
export const useCategorySync = (savedTabsUseCases: SavedTabsUseCases) =>
  useCallback(async () => {
    try {
      await savedTabsUseCases.syncCategoryAssignments({})
      console.log('[カテゴリ同期] use-case 経由で同期しました')
    } catch (error) {
      console.error('[カテゴリ同期] ストレージ同期エラー:', error)
    }
  }, [savedTabsUseCases])
