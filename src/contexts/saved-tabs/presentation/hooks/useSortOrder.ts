// Filepath: contexts/saved-tabs/presentation/hooks/useSortOrder.ts
import { useMemo } from 'react'

import type { SortPreferenceKey } from './sortPreferenceStore'
import { useSavedTabsSortOrder } from './useSavedTabsSortOrder'

/** ソート順の型 */
export type { SortOrder } from '@/contexts/saved-tabs/application/ports/SavedTabsSortPreferencesPort'

/**
 * ソート順とソート済みリストを管理するカスタムフック
 * @param items ソート対象の配列
 * @param getKey ソートキー取得関数（例: item => item.domain）
 */
export const useSortOrder = <T>(
  items: T[],
  getKey: (item: T) => string,
  preference?: SortPreferenceKey,
) => {
  const { sortOrder, setSortOrder, isPending } =
    useSavedTabsSortOrder(preference)
  const sortedItems = useMemo(() => {
    if (sortOrder === 'default') {
      return items
    }
    const arr = [...items]
    arr.sort((a, b) => getKey(a).localeCompare(getKey(b)))
    if (sortOrder === 'desc') {
      arr.reverse()
    }
    return arr
  }, [items, sortOrder, getKey])
  return {
    isPending,
    setSortOrder,
    sortOrder,
    sortedItems,
  }
}
