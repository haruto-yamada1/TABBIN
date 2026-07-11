import { getSavedTabs, saveTabGroups } from '@/lib/storage/tabs'
import type { TabGroup } from '@/types/storage'

const replaceTabGroup = (
  savedTabs: TabGroup[],
  updatedTabGroup: TabGroup,
): TabGroup[] =>
  savedTabs.map((tab: TabGroup) =>
    tab.id === updatedTabGroup.id ? updatedTabGroup : tab,
  )

const getCategoryKeywordsForName = (
  tabGroup: TabGroup,
  categoryName: string | null,
): string[] =>
  tabGroup.categoryKeywords?.find((ck) => ck.categoryName === categoryName)
    ?.keywords ?? []

const getRenameDraftName = (activeCategory: string | null): string =>
  activeCategory ?? ''

const shouldSkipRename = (oldName: string, newName: string): boolean =>
  !(oldName && newName) || oldName === newName

// タブグループを更新するヘルパー関数
const updateTabGroup = async (updatedTabGroup: TabGroup) => {
  try {
    const savedTabs = await getSavedTabs()
    const updatedTabs = replaceTabGroup(savedTabs, updatedTabGroup)
    await saveTabGroups(updatedTabs)
    return true
  } catch (error) {
    console.error('タブグループ更新エラー:', error)
    return false
  }
}

export {
  getCategoryKeywordsForName,
  getRenameDraftName,
  replaceTabGroup,
  shouldSkipRename,
  updateTabGroup,
}
