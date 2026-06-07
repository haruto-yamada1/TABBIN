import {
  getParentCategories,
  saveParentCategories,
  updateDomainCategoryMapping,
  updateDomainCategorySettings,
} from '@/lib/storage/categories'
import type { TabGroup } from '@/types/storage'

const ensureDomainNameInParentCategory = async (
  groupToRemove: TabGroup,
): Promise<void> => {
  if (!groupToRemove.parentCategoryId) {
    return
  }
  const parentCategories = await getParentCategories()
  const parentCategory = parentCategories.find(
    (cat) => cat.id === groupToRemove.parentCategoryId,
  )
  if (!parentCategory) {
    return
  }
  const hasDomainName = parentCategory.domainNames?.includes(
    groupToRemove.domain,
  )
  if (hasDomainName) {
    return
  }
  const updatedCategory = {
    ...parentCategory,
    domainNames: [...(parentCategory.domainNames || []), groupToRemove.domain],
  }
  await saveParentCategories(
    parentCategories.map((cat) =>
      cat.id === groupToRemove.parentCategoryId ? updatedCategory : cat,
    ),
  )
  console.log(
    `ドメイン ${groupToRemove.domain} を親カテゴリのdomainNamesに追加しました`,
  )
}
const updateDomainCategoryMappingIfNeeded = async (
  groupToRemove: TabGroup,
): Promise<void> => {
  if (!groupToRemove.parentCategoryId) {
    return
  }
  await updateDomainCategoryMapping(
    groupToRemove.domain,
    groupToRemove.parentCategoryId,
  )
  console.log(`ドメイン ${groupToRemove.domain} のマッピングを更新しました`)
}
/**
 * タブグループ削除前の処理関数
 * グループのカテゴリ設定を保存します
 *
 * @param groupId 削除対象のグループID
 */
export const handleTabGroupRemoval = async (groupId: string): Promise<void> => {
  try {
    const { savedTabs = [] } = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs')
    const groupToRemove = savedTabs.find(
      (group: TabGroup) => group.id === groupId,
    )
    if (!groupToRemove?.domain) {
      return
    }
    console.log(`グループ削除前の処理: ${groupToRemove.domain}`)
    await Promise.all([
      updateDomainCategorySettings(
        groupToRemove.domain,
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        groupToRemove.subCategories || [],
// eslint-disable-next-line typescript/prefer-nullish-coalescing
        groupToRemove.categoryKeywords || [],
      ),
      ensureDomainNameInParentCategory(groupToRemove),
      updateDomainCategoryMappingIfNeeded(groupToRemove),
    ])
  } catch (error) {
    console.error('タブグループ削除前処理エラー:', error)
  }
}
/**
 * カテゴリ内のタブ削除を安全に処理する関数
 *
 * @param groupId グループID
 * @param urls 更新後のURL一覧
 * @param callback 成功時のコールバック
 */
export const safelyUpdateGroupUrls = async (
  groupId: string,
  urls: TabGroup['urls'],
  callback?: () => void,
): Promise<void> => {
  try {
    // ローカルストレージからタブを取得
    const { savedTabs = [] } = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs')

    // 対象グループを特定
    const targetGroup = savedTabs.find((tab: TabGroup) => tab.id === groupId)
    if (!targetGroup) {
      console.log(`グループID ${groupId} が見つかりません`)
      if (callback) {
        Promise.resolve()
          .then(callback)
          .catch(() => {})
      }
      return
    }

    // グループ内のURLが空になる場合でも、グループ自体は維持（表示はしない）
// eslint-disable-next-line oxc/no-map-spread
    const updatedTabs = savedTabs.map((tab: TabGroup) => {
      if (tab.id === groupId) {
        return {
          ...tab,
          urls,
        }
      }
      return tab
    })

    // 更新を保存
    await chrome.storage.local.set({
      savedTabs: updatedTabs,
    })
    const urlCount = urls?.length ?? 0

    // URLsが空の場合はコンソールにその旨を出力
    if (urlCount === 0) {
      console.log(
        `グループ ${groupId} (${targetGroup.domain}) のURLがすべて削除されました。表示から除外されます。`,
      )
      try {
        chrome.runtime
          .sendMessage({
            action: 'groupEmptied',
            groupId,
          })
          .catch(() => {
            // エラーは無視（拡張がアクティブでない場合など）
          })
      } catch {
        // メッセージ送信エラーは無視
      }
    } else {
      console.log(
        `グループ ${groupId} のURLを更新しました。残り: ${urlCount}件`,
      )
    }

    // 成功時にコールバックを実行 - 非同期で実行
    if (callback) {
      Promise.resolve()
        .then(callback)
        .catch(() => {})
    }
// eslint-disable-next-line eslint/no-useless-return
    return
  } catch (error) {
    console.error('タブ更新エラー:', error)
    throw error
  }
}
