// Filepath: contexts/saved-tabs/presentation/hooks/useSortOrder.ts
import { useMemo, useState } from 'react'

/** ソート順の型 */
export type SortOrder = 'default' | 'asc' | 'desc'

/**
 * ソート順とソート済みリストを管理するカスタムフック
 * @param items ソート対象の配列
 * @param getKey ソートキー取得関数（例: item => item.domain）
 */
export const useSortOrder = <T>(items: T[], getKey: (item: T) => string) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>('default')
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
    setSortOrder,
    sortOrder,
    sortedItems,
  }
}
