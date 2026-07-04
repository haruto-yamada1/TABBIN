import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'

/**
 * キーワードの保存を処理する関数。
 *
 * `@/lib/storage/tabs.setCategoryKeywords` 直叩きを置換し、
 * use-case 経由で副作用を委譲する（issue #501）。
 *
 * @param useCases - SavedTabs の use-case バンドル
 * @param groupId - 対象 TabGroup ID
 * @param categoryName - カテゴリ名
 * @param keywords - キーワード一覧
 */
export const handleSaveKeywords = async (
  useCases: SavedTabsUseCases,
  groupId: string,
  categoryName: string,
  keywords: string[],
) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    await useCases.setCategoryKeywords({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      tabGroupId: groupId,
      categoryName,
      keywords,
    })
    console.log('カテゴリキーワードを保存しました:', {
      categoryName,
      groupId,
      keywords,
    })
  } catch (error) {
    console.error('カテゴリキーワード保存エラー:', error)
  }
}
