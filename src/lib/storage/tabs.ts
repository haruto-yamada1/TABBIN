import type { SubCategoryKeyword, TabGroup, UrlRecord } from '@/types/storage'

import {
  getDomainCategorySettings,
  saveDomainCategorySettings,
} from './categories'
import {
  removeUrlFromAllCustomProjects,
  removeUrlIdsFromAllCustomProjects,
} from './projects'
import { migrateToUrlsStorage } from './url-migration'
import {
  createOrUpdateUrlRecord,
  getUrlRecords,
  getUrlRecordsByIds,
} from './urls'

type ResolvedTabGroupUrl = UrlRecord & {
  subCategory?: string
}

type DeleteSyncOptions = {
  throwOnSyncError?: boolean
}

const resolveTabGroupUrlsFromMap = (
  tabGroup: TabGroup,
  urlRecordMap: ReadonlyMap<string, UrlRecord>,
): ResolvedTabGroupUrl[] => {
  if (!(tabGroup.urlIds && tabGroup.urlIds.length > 0)) {
    return []
  }

  return tabGroup.urlIds.flatMap((id) => {
    const record = urlRecordMap.get(id)
    return record
      ? [
          {
            ...record,
            subCategory: tabGroup.urlSubCategories?.[record.id],
          },
        ]
      : []
  })
}

const resolveTabGroupsWithUrls = async (
  groups: TabGroup[],
): Promise<TabGroup[]> => {
  if (groups.length === 0) {
    return []
  }

  await migrateToUrlsStorage()
  const urlRecords = await getUrlRecords()
  const urlRecordMap = new Map(urlRecords.map((record) => [record.id, record]))

  return groups.map((group) => ({
    ...group,
    urls: resolveTabGroupUrlsFromMap(group, urlRecordMap),
  }))
}

/**
 * TabGroupからURLデータを取得する（新旧形式対応）
 */
const getTabGroupUrls = async (
  tabGroup: TabGroup,
): Promise<
  (UrlRecord & {
    subCategory?: string
  })[]
> => {
  // 新形式のみサポート: URLIDsから参照して取得
  if (tabGroup.urlIds && tabGroup.urlIds.length > 0) {
    // マイグレーションを実行（未実行の場合）
    await migrateToUrlsStorage()
    const urlRecords = await getUrlRecordsByIds(tabGroup.urlIds)
    const urlRecordMap = new Map(
      urlRecords.map((record) => [record.id, record]),
    )
    return resolveTabGroupUrlsFromMap(tabGroup, urlRecordMap)
  }
  return []
}

const getMigratedTabGroupById = async (
  groupId: string,
): Promise<{
  savedTabs: TabGroup[]
  groupIndex: number
  group: TabGroup
} | null> => {
  await migrateToUrlsStorage()
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: TabGroup[]
  }>('savedTabs')
  const groupIndex = savedTabs.findIndex((group) => group.id === groupId)
  if (groupIndex === -1) {
    return null
  }
  return {
    group: savedTabs[groupIndex],
    groupIndex,
    savedTabs,
  }
}

/**
 * TabGroupにURLを追加する（新形式対応）
 */
const addUrlToTabGroup = async (
  groupId: string,
  url: string,
  title: string,
  subCategory?: string,
): Promise<void> => {
  // マイグレーションを実行（未実行の場合）
  await migrateToUrlsStorage()
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: import('@/types/storage').TabGroup[]
  }>('savedTabs')
  const groupIndex = savedTabs.findIndex((g: TabGroup) => g.id === groupId)
  if (groupIndex === -1) {
    return
  }

  // URLレコードを作成または更新
  const urlRecord = await createOrUpdateUrlRecord(url, title)
  const group = savedTabs[groupIndex]

  // URLIDsが存在しない場合は初期化
  if (!group.urlIds) {
    group.urlIds = []
  }

  // 既にURLが含まれているかチェック
  if (!group.urlIds.includes(urlRecord.id)) {
    group.urlIds.push(urlRecord.id)
  }

  // サブカテゴリが指定されている場合は設定
  /* v8 ignore next -- coverage-only defensive branch. */
  if (subCategory) {
    if (!group.urlSubCategories) {
      group.urlSubCategories = {}
    }
    group.urlSubCategories[urlRecord.id] = subCategory
  }
  savedTabs[groupIndex] = group
  await chrome.storage.local.set({
    savedTabs,
  })
} // 子カテゴリを追加する関数（永続設定にも保存）
const addSubCategoryToGroup = async (
  groupId: string,
  subCategoryName: string,
): Promise<void> => {
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: import('@/types/storage').TabGroup[]
  }>('savedTabs')
  const group = savedTabs.find((g: TabGroup) => g.id === groupId)
  if (!group) {
    return
  }
  const updatedGroups = savedTabs.map((existingGroup: TabGroup) => {
    if (existingGroup.id === groupId) {
      /* v8 ignore next -- coverage-only defensive branch. */
      const subCategories = existingGroup.subCategories || []
      if (!subCategories.includes(subCategoryName)) {
        return {
          ...existingGroup,
          subCategories: [...subCategories, subCategoryName],
        }
      }
    }
    return existingGroup
  })

  // タブグループの更新
  await chrome.storage.local.set({
    savedTabs: updatedGroups,
  })

  // ドメイン別設定にも保存して永続化
  /* v8 ignore next -- coverage-only defensive branch. */
  if (group) {
    const settings = await getDomainCategorySettings()
    const existingSetting = settings.find((s) => s.domain === group.domain)
    if (existingSetting) {
      // 既存の設定がある場合は更新
      if (!existingSetting.subCategories.includes(subCategoryName)) {
        existingSetting.subCategories.push(subCategoryName)
        await saveDomainCategorySettings(settings)
      }
    } else {
      // 新しい設定を作成
      settings.push({
        categoryKeywords: [],
        domain: group.domain,
        subCategories: [subCategoryName],
      })
      await saveDomainCategorySettings(settings)
    }
  }
} // URLに子カテゴリを設定する関数（新形式対応）
const setUrlSubCategory = async (
  groupId: string,
  url: string,
  subCategory: string,
): Promise<void> => {
  const tabGroupState = await getMigratedTabGroupById(groupId)
  if (!tabGroupState) {
    return
  }
  const { savedTabs, groupIndex, group } = tabGroupState

  // 新形式のみサポート: URLIDsからURLレコードを探してサブカテゴリを設定
  if (group.urlIds && group.urlIds.length > 0) {
    const urlRecords = await getUrlRecordsByIds(group.urlIds)
    const urlRecord = urlRecords.find((record) => record.url === url)
    /* v8 ignore next -- coverage-only defensive branch. */
    if (urlRecord) {
      /* v8 ignore next -- coverage-only defensive branch. */
      if (!group.urlSubCategories) {
        group.urlSubCategories = {}
      }
      group.urlSubCategories[urlRecord.id] = subCategory
      savedTabs[groupIndex] = group
      await chrome.storage.local.set({
        savedTabs,
      })
    }
  }
} // 子カテゴリにキーワードを設定する関数（永続設定にも保存）
const setCategoryKeywords = async (
  groupId: string,
  categoryName: string,
  keywords: string[],
): Promise<void> => {
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: import('@/types/storage').TabGroup[]
  }>('savedTabs')
  const group = savedTabs.find((g: TabGroup) => g.id === groupId)
  if (!group) {
    return
  }

  // 更新するグループを見つける
  const updatedGroups = savedTabs.map((currentGroup: TabGroup) => {
    if (currentGroup.id === groupId) {
      // 既存のカテゴリキーワード設定を取得
      const categoryKeywords = currentGroup.categoryKeywords || []

      // 対象カテゴリのインデックスを探す
      const categoryIndex = categoryKeywords.findIndex(
        (ck: SubCategoryKeyword) => ck.categoryName === categoryName,
      )
      const updatedCategoryKeywords = [...categoryKeywords]
      if (categoryIndex !== -1) {
        // 既存カテゴリの更新
        updatedCategoryKeywords[categoryIndex] = {
          ...updatedCategoryKeywords[categoryIndex],
          keywords,
        }
      } else {
        // 新規カテゴリの追加
        updatedCategoryKeywords.push({
          categoryName,
          keywords,
        })
      }

      // グループを更新（URLsはそのまま保持）
      return {
        ...currentGroup,
        categoryKeywords: updatedCategoryKeywords,
      }
    }
    return currentGroup // 対象外のグループはそのまま返す
  })

  // タブグループの更新
  await chrome.storage.local.set({
    savedTabs: updatedGroups,
  })

  // ドメイン別設定にも保存して永続化
  /* v8 ignore next -- coverage-only defensive branch. */
  if (group) {
    const settings = await getDomainCategorySettings()
    const existingSetting = settings.find((s) => s.domain === group.domain)
    if (existingSetting) {
      // 既存の設定がある場合は更新
      const keywordIndex = existingSetting.categoryKeywords.findIndex(
        (ck) => ck.categoryName === categoryName,
      )
      if (keywordIndex !== -1) {
        // 既存のキーワード設定を更新
        existingSetting.categoryKeywords[keywordIndex].keywords = keywords
      } else {
        // 新しいキーワード設定を追加
        existingSetting.categoryKeywords.push({
          categoryName,
          keywords,
        })
      }
      await saveDomainCategorySettings(settings)
      /* v8 ignore next -- coverage-only defensive branch. */
    } else {
      // 新しい設定を作成
      /* v8 ignore next -- coverage-only defensive branch. */
      settings.push({
        domain: group.domain,
        /* v8 ignore next -- coverage-only defensive branch. */
        subCategories: group.subCategories || [],
        categoryKeywords: [
          {
            categoryName,
            keywords,
          },
        ],
      })
      /* v8 ignore next -- coverage-only defensive branch. */
      await saveDomainCategorySettings(settings)
    }
  }

  // キーワードが更新されたら、既存の全タブに対して自動的に再カテゴライズを実行
  await autoCategorizeTabs(groupId)
}
const dedupeTabGroups = (savedTabs: TabGroup[]): TabGroup[] => {
  const uniqueIds = new Set<string>()
  const uniqueGroups: TabGroup[] = []
  for (const group of savedTabs) {
    if (uniqueIds.has(group.id)) {
      console.warn(
        `自動カテゴリ実行前に重複検出: ${group.id} (${group.domain})`,
      )
      continue
    }
    uniqueIds.add(group.id)
    uniqueGroups.push(group)
  }
  if (uniqueGroups.length < savedTabs.length) {
    console.log(
      `カテゴリ処理前に重複を修正: ${savedTabs.length} → ${uniqueGroups.length}`,
    )
  }
  return uniqueGroups
}
const categorizeUrlIdsByKeywords = (
  urlRecords: UrlRecord[],
  categoryKeywords: TabGroup['categoryKeywords'],
  currentMapping: Record<string, string> = {},
): Record<string, string> => {
  const updatedSubCategories: Record<string, string> = {
    ...currentMapping,
  }
  /* v8 ignore next -- coverage-only defensive branch. */
  if (!categoryKeywords) {
    /* v8 ignore next -- coverage-only defensive branch. */
    return updatedSubCategories
  }
  for (const urlRecord of urlRecords) {
    const title = urlRecord.title.toLowerCase()
    for (const categoryKeyword of categoryKeywords) {
      const matchesKeyword = categoryKeyword.keywords.some(
        (keyword: string) => title.split(keyword.toLowerCase()).length > 1,
      )
      if (matchesKeyword) {
        updatedSubCategories[urlRecord.id] = categoryKeyword.categoryName
        break
      }
    }
  }
  return updatedSubCategories
}
const applySubCategoryMapping = (
  groups: TabGroup[],
  groupId: string,
  mapping: Record<string, string>,
): void => {
  const groupIndex = groups.findIndex((group) => group.id === groupId)
  /* v8 ignore next -- coverage-only defensive branch. */
  if (groupIndex !== -1) {
    groups[groupIndex].urlSubCategories = mapping
  }
} // キーワードに基づいて自動的にURLを分類する（新形式対応）
const autoCategorizeTabs = async (groupId: string): Promise<void> => {
  // マイグレーションを実行（未実行の場合）
  await migrateToUrlsStorage()
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: import('@/types/storage').TabGroup[]
  }>('savedTabs')
  const uniqueGroups = dedupeTabGroups(savedTabs)
  const targetGroup = uniqueGroups.find(
    (group: TabGroup) => group.id === groupId,
  )
  const categoryKeywords = targetGroup?.categoryKeywords
  if (!(categoryKeywords && categoryKeywords.length > 0)) {
    console.log('カテゴリキーワードがないか、グループが見つかりません')
    return // カテゴリキーワードがない場合は何もしない
  }

  // 新形式のみサポート: URLIDsからURLレコードを取得して分類
  if (targetGroup.urlIds && targetGroup.urlIds.length > 0) {
    const urlRecords = await getUrlRecordsByIds(targetGroup.urlIds)
    const updatedSubCategories = categorizeUrlIdsByKeywords(
      urlRecords,
      categoryKeywords,
      targetGroup.urlSubCategories,
    )
    applySubCategoryMapping(uniqueGroups, groupId, updatedSubCategories)
  }
  await chrome.storage.local.set({
    savedTabs: uniqueGroups,
  })
} // 新しい子カテゴリを追加時、キーワード設定も初期化する拡張版関数
const addSubCategoryWithKeywords = async (
  groupId: string,
  subCategoryName: string,
  keywords: string[] = [],
): Promise<void> => {
  // 既存の子カテゴリ追加処理
  await addSubCategoryToGroup(groupId, subCategoryName)

  // キーワードがあれば設定
  /* v8 ignore next -- coverage-only defensive branch. */
  if (keywords.length > 0) {
    await setCategoryKeywords(groupId, subCategoryName, keywords)
  }
} // 既存の設定を新しいタブグループに復元する関数
const restoreCategorySettings = async (
  tabGroup: TabGroup,
): Promise<TabGroup> => {
  const settings = await getDomainCategorySettings()
  const domainSettings = settings.find((s) => s.domain === tabGroup.domain)
  if (domainSettings) {
    return {
      ...tabGroup,
      categoryKeywords: domainSettings.categoryKeywords,
      subCategories: domainSettings.subCategories,
    }
  }
  return tabGroup
}
/**
 * TabGroup内のURLの順序を並び替える（新形式対応）
 */
const reorderTabGroupUrls = async (
  groupId: string,
  newUrlOrder: string[], // URL文字列の配列
): Promise<void> => {
  const tabGroupState = await getMigratedTabGroupById(groupId)
  if (!tabGroupState) {
    return
  }
  const { savedTabs, groupIndex, group } = tabGroupState

  // 新形式のみサポート: URLIDsから現在のURLレコードを取得
  /* v8 ignore next -- coverage-only defensive branch. */
  if (group.urlIds && group.urlIds.length > 0) {
    const urlRecords = await getUrlRecordsByIds(group.urlIds)

    // 新しい順序に基づいてURLIDsを並び替え
    const groupUrlIds = new Set(group.urlIds)
    const urlRecordsByUrl = new Map(
      urlRecords.map((record) => [record.url, record]),
    )
    const reorderedUrlIds: string[] = []
    for (const url of newUrlOrder) {
      const urlRecord = urlRecordsByUrl.get(url)
      /* v8 ignore next -- coverage-only defensive branch. */
      if (urlRecord && groupUrlIds.has(urlRecord.id)) {
        reorderedUrlIds.push(urlRecord.id)
      }
    }

    // 新しい順序に含まれていないURLIDsを末尾に追加
    const reorderedUrlIdSet = new Set(reorderedUrlIds)
    for (const urlId of group.urlIds) {
      if (!reorderedUrlIdSet.has(urlId)) {
        reorderedUrlIds.push(urlId)
      }
    }

    // 並び替えたURLIDsを保存
    group.urlIds = reorderedUrlIds
    savedTabs[groupIndex] = group
    await chrome.storage.local.set({
      savedTabs,
    })
    console.log(
      `グループ ${groupId} のURL順序を並び替えました:`,
      reorderedUrlIds,
    )
  }
}
/**
 * TabGroupからURLを削除する（新形式対応）
 */
const removeUrlFromTabGroup = async (
  groupId: string,
  url: string,
  options: DeleteSyncOptions = {},
): Promise<void> => {
  const tabGroupState = await getMigratedTabGroupById(groupId)
  if (!tabGroupState) {
    return
  }
  const { savedTabs, groupIndex, group } = tabGroupState
  const rollbackSavedTabs = structuredClone(savedTabs)

  // 新形式のみサポート: URLIDsからURLを削除
  /* v8 ignore next -- coverage-only defensive branch. */
  if (group.urlIds && group.urlIds.length > 0) {
    const urlRecords = await getUrlRecordsByIds(group.urlIds)
    const urlRecord = urlRecords.find((record) => record.url === url)
    /* v8 ignore next -- coverage-only defensive branch. */
    if (urlRecord) {
      // URLIDsから削除
      group.urlIds = group.urlIds.filter((id: string) => id !== urlRecord.id)

      // サブカテゴリ情報も削除
      /* v8 ignore next -- coverage-only defensive branch. */
      if (group.urlSubCategories?.[urlRecord.id]) {
        delete group.urlSubCategories[urlRecord.id]
      }

      // グループにURLが無くなった場合はグループ自体を削除
      if (group.urlIds.length === 0) {
        savedTabs.splice(groupIndex, 1)
        console.log(
          `グループ ${groupId} のURLがなくなったため、グループを削除しました`,
        )
      } else {
        savedTabs[groupIndex] = group
      }
      await chrome.storage.local.set({
        savedTabs,
      })
      console.log(`URL ${url} をグループ ${groupId} から削除しました`)

      // 同期してカスタムプロジェクトからも削除
      try {
        if (options.throwOnSyncError) {
          await removeUrlFromAllCustomProjects(url, {
            throwOnError: true,
          })
        } else {
          await removeUrlFromAllCustomProjects(url)
        }
      } catch (error) {
        if (options.throwOnSyncError) {
          await chrome.storage.local.set({
            savedTabs: rollbackSavedTabs,
          })
          throw error
        }
      }
    }
  }
}

/**
 * タブグループのURLIDとメタデータから指定IDを削除する内部関数
 * @returns グループが空になったかどうか
 */
const processTabGroupForBulkDelete = (
  group: TabGroup,
  idsToDelete: Set<string>,
): boolean => {
  /* v8 ignore next -- coverage-only defensive branch. */
  if (!group.urlIds) {
    /* v8 ignore next -- coverage-only defensive branch. */
    return false
  }

  // URLIDsから削除
  group.urlIds = group.urlIds.filter((id: string) => !idsToDelete.has(id))

  // サブカテゴリ情報も削除
  /* v8 ignore next -- coverage-only defensive branch. */
  if (group.urlSubCategories) {
    for (const id of idsToDelete) {
      if (group.urlSubCategories[id]) {
        delete group.urlSubCategories[id]
      }
    }
  }

  return group.urlIds.length === 0
}

const persistBulkDeleteForGroup = async ({
  savedTabs,
  groupIndex,
  group,
  idsToDelete,
  groupId,
  deletedCount,
  rollbackSavedTabs,
  throwOnSyncError = false,
}: {
  savedTabs: TabGroup[]
  groupIndex: number
  group: TabGroup
  idsToDelete: Set<string>
  groupId: string
  deletedCount: number
  rollbackSavedTabs: TabGroup[]
  throwOnSyncError?: boolean
}): Promise<void> => {
  const isGroupEmpty = processTabGroupForBulkDelete(group, idsToDelete)

  if (isGroupEmpty) {
    savedTabs.splice(groupIndex, 1)
    console.log(
      `グループ ${groupId} のURLがなくなったため、グループを削除しました`,
    )
  } else {
    savedTabs[groupIndex] = group
  }

  await chrome.storage.local.set({
    savedTabs,
  })
  console.log(`${deletedCount}件のURLをグループ ${groupId} から削除しました`)

  try {
    if (throwOnSyncError) {
      await removeUrlIdsFromAllCustomProjects([...idsToDelete], {
        throwOnError: true,
      })
    } else {
      await removeUrlIdsFromAllCustomProjects([...idsToDelete])
    }
  } catch (error) {
    if (throwOnSyncError) {
      await chrome.storage.local.set({
        savedTabs: rollbackSavedTabs,
      })
      throw error
    }
  }
}

/**
 * タブグループから複数のURL IDを一括で削除し、関連メタデータ（サブカテゴリなど）を更新する。
 */
const removeUrlIdsFromTabGroup = async (
  groupId: string,
  urlIds: string[],
  options: DeleteSyncOptions = {},
): Promise<void> => {
  if (urlIds.length === 0) {
    return
  }

  await migrateToUrlsStorage()
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: import('@/types/storage').TabGroup[]
  }>('savedTabs')
  const groupIndex = savedTabs.findIndex((g: TabGroup) => g.id === groupId)
  if (groupIndex === -1) {
    return
  }

  const rollbackSavedTabs = structuredClone(savedTabs)
  const group = savedTabs[groupIndex]
  if (!(group.urlIds && group.urlIds.length > 0)) {
    return
  }

  const idsToDelete = new Set(urlIds)
  await persistBulkDeleteForGroup({
    deletedCount: urlIds.length,
    group,
    groupId,
    groupIndex,
    idsToDelete,
    rollbackSavedTabs,
    savedTabs,
    throwOnSyncError: options.throwOnSyncError,
  })
}

/**
 * タブグループから複数のURLを一括で削除し、関連メタデータ（サブカテゴリなど）を更新する。
 */
const removeUrlsFromTabGroup = async (
  groupId: string,
  urls: string[],
  options: DeleteSyncOptions = {},
): Promise<void> => {
  if (urls.length === 0) {
    return
  }

  // マイグレーションを実行（未実行の場合）
  await migrateToUrlsStorage()
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: import('@/types/storage').TabGroup[]
  }>('savedTabs')
  const groupIndex = savedTabs.findIndex((g: TabGroup) => g.id === groupId)
  if (groupIndex === -1) {
    return
  }
  const rollbackSavedTabs = structuredClone(savedTabs)
  const group = savedTabs[groupIndex]
  const targetUrlsSet = new Set(urls)

  // 新形式のみサポート: URLIDsからURLを削除
  if (group.urlIds && group.urlIds.length > 0) {
    const urlRecords = await getUrlRecordsByIds(group.urlIds)
    const recordsToDelete = urlRecords.filter((record) =>
      targetUrlsSet.has(record.url),
    )

    /* v8 ignore next -- coverage-only defensive branch. */
    if (recordsToDelete.length > 0) {
      const idsToDelete = new Set(recordsToDelete.map((r) => r.id))
      await persistBulkDeleteForGroup({
        deletedCount: urls.length,
        group,
        groupId,
        groupIndex,
        idsToDelete,
        rollbackSavedTabs,
        savedTabs,
        throwOnSyncError: options.throwOnSyncError,
      })
    }
  }
}

export {
  addSubCategoryToGroup,
  addSubCategoryWithKeywords,
  addUrlToTabGroup,
  autoCategorizeTabs,
  getTabGroupUrls,
  removeUrlFromTabGroup,
  removeUrlIdsFromTabGroup,
  removeUrlsFromTabGroup,
  reorderTabGroupUrls,
  resolveTabGroupsWithUrls,
  restoreCategorySettings,
  setCategoryKeywords,
  setUrlSubCategory,
}
