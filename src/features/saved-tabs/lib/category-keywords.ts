import { setCategoryKeywords } from '@/lib/storage/tabs'

// キーワードの保存を処理する関数
export const handleSaveKeywords = async (
  groupId: string,
  categoryName: string,
  keywords: string[],
) => {
  try {
    await setCategoryKeywords(groupId, categoryName, keywords)
    console.log('カテゴリキーワードを保存しました:', {
      categoryName,
      groupId,
      keywords,
    })
  } catch (error) {
    console.error('カテゴリキーワード保存エラー:', error)
  }
}
