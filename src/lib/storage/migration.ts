import { v4 as uuidv4 } from 'uuid'

import { filterItemsBySavableUrl } from '@/lib/url-filter'
import type {
  DomainParentCategoryMapping,
  ParentCategory,
  TabGroup,
} from '@/types/storage'

import {
  getDomainCategoryMappings,
  getParentCategories,
  saveParentCategories,
  updateDomainCategoryMapping,
} from './categories'
import { getUserSettings } from './settings'
import { autoCategorizeTabs, restoreCategorySettings } from './tabs'
import { createOrUpdateUrlRecord } from './urls'

// ドメインを親カテゴリに割り当てる関数
const assignDomainToCategory = async (
  domainId: string,
  categoryId: string,
): Promise<void> => {
  const [categories, tabGroup] = await Promise.all([
    getParentCategories(),
    getTabGroupById(domainId),
  ])

  // ドメイン-カテゴリのマッピングも更新
  if (tabGroup) {
    // カテゴリが"none"でなければマッピングを更新
    if (categoryId !== 'none') {
      await updateDomainCategoryMapping(tabGroup.domain, categoryId)
    } else {
      // "none"の場合はマッピングを削除
      await updateDomainCategoryMapping(tabGroup.domain, null)
    }
  }
  const updatedCategories = categories.map((category: ParentCategory) => {
    if (category.id === categoryId) {
      // すでに含まれていなければ追加
      if (!category.domains.includes(domainId)) {
        return {
          ...category,
          domains: [...category.domains, domainId],
          domainNames: category.domainNames?.includes(tabGroup?.domain ?? '')
            ? category.domainNames
            : [...(category.domainNames || []), tabGroup?.domain ?? ''],
        }
      }
    } else {
      // 他のカテゴリからは削除（重複を避けるため）
      return {
        ...category,
        domains: category.domains.filter((id) => id !== domainId),
        domainNames: (category.domainNames || []).filter((domain) =>
          tabGroup ? domain !== tabGroup.domain : true,
        ),
      }
    }
    return category
  })
  await saveParentCategories(updatedCategories)
} // 既存のデータを更新し、domainNamesプロパティを追加する移行関数
const migrateParentCategoriesToDomainNames = async (): Promise<void> => {
  try {
    console.log('親カテゴリのdomainNames移行を緊急実行します')
    const [categories, savedTabsResult, domainCategoryMappingsResult] =
      await Promise.all([
        getParentCategories(),
        chrome.storage.local.get<{
          savedTabs?: import('@/types/storage').TabGroup[]
        }>('savedTabs'),
        chrome.storage.local.get<{
          domainCategoryMappings?: import('@/types/storage').DomainParentCategoryMapping[]
        }>('domainCategoryMappings'),
      ])
    const { savedTabs = [] } = savedTabsResult
    const { domainCategoryMappings = [] } = domainCategoryMappingsResult
    console.log('現在の親カテゴリ:', categories)
    console.log('現在のタブグループ数:', savedTabs.length)
    console.log('現在のドメインマッピング数:', domainCategoryMappings.length)

    // 各カテゴリの状態をログ出力
    const savedTabById = new Map(
      savedTabs.map((tab: TabGroup) => [tab.id, tab]),
    )
    for (const category of categories) {
      console.log(`カテゴリ「${category.name}」の状態:`, {
        id: category.id,
        domains: category.domains,
        domainNames: category.domainNames || [],
      })

      // マッピングから検索
      const mappingsForCategory = domainCategoryMappings.filter(
        (m: DomainParentCategoryMapping) => m.categoryId === category.id,
      )
      console.log(
        `  マッピングから見つかったドメイン: ${mappingsForCategory.map((m: DomainParentCategoryMapping) => m.domain).join(', ')}`,
      )

      // SavedTabsからドメイン名を検索
      const domainsFromTabs = []
      for (const domainId of category.domains) {
        const tab = savedTabById.get(domainId)
        if (tab) {
          domainsFromTabs.push(tab.domain)
        }
      }
      console.log(`  タブから見つかったドメイン: ${domainsFromTabs.join(', ')}`)
    }

    // マイグレーション実行
    const updatedCategories = categories.map((category) => {
      // ドメインIDに対応するドメイン名を取得
      const domainNames = category.domains.flatMap((domainId) => {
        const group = savedTabById.get(domainId)
        return group?.domain ? [group.domain] : []
      })

      // マッピングからもドメイン名を取得
      const mappingDomains = domainCategoryMappings.flatMap(
        (mapping: DomainParentCategoryMapping) =>
          mapping.categoryId === category.id ? [mapping.domain] : [],
      )

      // 既存のdomainNamesと結合して重複排除
      const allDomains = [
        ...new Set([
          ...(category.domainNames || []),
          ...domainNames,
          ...mappingDomains,
        ]),
      ]
      console.log(
        `カテゴリ「${category.name}」の更新後domainNames:`,
        allDomains,
      )

      // 強制的にdomainNamesを上書き
      return {
        ...category,
        domainNames: allDomains,
      }
    })
    console.log('更新後の親カテゴリ:', updatedCategories)

    // ストレージに保存
    await chrome.storage.local.set({
      parentCategories: updatedCategories,
    })
    console.log('親カテゴリのdomainNames移行が完了しました')

    // 確認のため保存後のデータも取得
    const savedCategories = await getParentCategories()
    console.log('保存後の親カテゴリ:', savedCategories)
    return
  } catch (error) {
    console.error('親カテゴリ移行エラー:', error)
    throw error
  }
}
interface DomainCategoryMatch {
  category: ParentCategory
  method: 'mapping' | 'domainNames'
}
const buildGroupedTabsByDomain = (
  savedTabs: TabGroup[],
): Map<string, TabGroup> => {
  const groupedTabs = new Map<string, TabGroup>()
  for (const group of savedTabs) {
    groupedTabs.set(group.domain, group)
  }
  return groupedTabs
}
const logParentCategorySnapshot = (
  parentCategories: ParentCategory[],
): void => {
  console.log('親カテゴリ一覧:', parentCategories)
  for (const category of parentCategories) {
    console.log(
      `カテゴリ「${category.name}」のドメイン名一覧:`,
      category.domainNames || [],
    )
  }
}
const normalizeParentCategoriesIfNeeded = async (
  parentCategories: ParentCategory[],
): Promise<ParentCategory[]> => {
  const hasEmptyDomainNames = parentCategories.some(
    (cat) => !cat.domainNames || cat.domainNames.length === 0,
  )
  if (!hasEmptyDomainNames) {
    return parentCategories
  }
  console.log('空のdomainNames配列を検出、緊急マイグレーションを実行')
  await migrateParentCategoriesToDomainNames()
  const updatedCategories = await getParentCategories()
  console.log('マイグレーション後の親カテゴリ:', updatedCategories)
  return updatedCategories
}
const findCategoryByDomainMapping = (
  domain: string,
  domainCategoryMappings: DomainParentCategoryMapping[],
  parentCategories: ParentCategory[],
): DomainCategoryMatch | null => {
  const domainMapping = domainCategoryMappings.find((m) => m.domain === domain)
  if (!domainMapping) {
    return null
  }
  const category = parentCategories.find(
    (c) => c.id === domainMapping.categoryId,
  )
  if (!category) {
    return null
  }
  console.log(
    `ドメイン ${domain} は親カテゴリ「${category.name}」のマッピングに見つかりました`,
  )
  return {
    category,
    method: 'mapping',
  }
}
const findCategoryByDomainNames = (
  domain: string,
  parentCategories: ParentCategory[],
): DomainCategoryMatch | null => {
  for (const category of parentCategories) {
    if (!Array.isArray(category.domainNames)) {
      console.log(`カテゴリ「${category.name}」のdomainNamesが不正です`)
      continue
    }
    console.log(`カテゴリ「${category.name}」のdomainNamesで検索:`, {
      domainNames: category.domainNames,
      searchDomain: domain,
    })
    if (category.domainNames.some((d) => d === domain)) {
      console.log(
        `ドメイン ${domain} は親カテゴリ「${category.name}」のdomainNamesに見つかりました`,
      )
      return {
        category,
        method: 'domainNames',
      }
    }
  }
  return null
}
const findParentCategoryForDomain = (
  domain: string,
  domainCategoryMappings: DomainParentCategoryMapping[],
  parentCategories: ParentCategory[],
): DomainCategoryMatch | null =>
  findCategoryByDomainMapping(
    domain,
    domainCategoryMappings,
    parentCategories,
  ) || findCategoryByDomainNames(domain, parentCategories)
const assignGroupToCategory = async (
  group: TabGroup,
  domain: string,
  match: DomainCategoryMatch,
): Promise<void> => {
  console.log(
    `ドメイン ${domain} を親カテゴリ「${match.category.name}」に割り当てます (検出方法: ${match.method})`,
  )
  group.parentCategoryId = match.category.id
  const domainNames = Array.isArray(match.category.domainNames)
    ? match.category.domainNames
    : []
  const updatedCategory: ParentCategory = {
    ...match.category,
    domainNames: domainNames.includes(domain)
      ? domainNames
      : [...domainNames, domain],
    domains: [...match.category.domains, group.id],
  }
  await Promise.all([
    updateCategoryDomains(updatedCategory),
    updateDomainCategoryMapping(domain, match.category.id),
  ])
  console.log(`ドメイン ${domain} と親カテゴリのマッピングを更新しました`)
}
const createGroupForDomain = async (
  domain: string,
  domainCategoryMappings: DomainParentCategoryMapping[],
  parentCategories: ParentCategory[],
): Promise<TabGroup> => {
  const newGroup: TabGroup = {
    domain,
    id: uuidv4(),
    savedAt: Date.now(),
    subCategories: [],
    urlIds: [],
  }
  const restoredGroup = await restoreCategorySettings(newGroup)
  const match = findParentCategoryForDomain(
    domain,
    domainCategoryMappings,
    parentCategories,
  )
  if (!match) {
    console.log(`ドメイン ${domain} の親カテゴリが見つからないため未分類です`)
    return restoredGroup
  }
  await assignGroupToCategory(restoredGroup, domain, match)
  return restoredGroup
}
const dedupeGroupsById = (groupArray: TabGroup[]): TabGroup[] => {
  const idSet = new Set<string>()
  return groupArray.filter((group) => {
    if (idSet.has(group.id)) {
      console.warn(`重複ID検出: ${group.id} (${group.domain})`)
      return false
    }
    idSet.add(group.id)
    return true
  })
}
const getTabDomain = (tabUrl: string): string | null => {
  try {
    const parsedUrl = new URL(tabUrl)
    return `${parsedUrl.protocol}//${parsedUrl.hostname}`
  } catch (error) {
    console.error(`Invalid URL: ${tabUrl}`, error)
    return null
  }
}

const getTabsWithDomains = (
  tabs: chrome.tabs.Tab[],
): { domain: string; tab: chrome.tabs.Tab; url: string }[] =>
  tabs.reduce<{ domain: string; tab: chrome.tabs.Tab; url: string }[]>(
    (items, tab) => {
      const tabUrl = tab.url
      if (!tabUrl) {
        return items
      }
      const domain = getTabDomain(tabUrl)
      if (domain) {
        items.push({ domain, tab, url: tabUrl })
      }
      return items
    },
    [],
  )

const getUniqueDomainsFromTabs = (tabs: chrome.tabs.Tab[]): Set<string> =>
  new Set(
    tabs.flatMap((tab) => {
      try {
        const url = new URL(tab.url || '')
        return [`${url.protocol}//${url.hostname}`]
      } catch {
        return []
      }
    }),
  )
// SaveTabs関数の実装（1つだけ残す）
const saveTabs = async (tabs: chrome.tabs.Tab[]) => {
  console.log('タブを保存します:', tabs.length)
  const [
    savedTabsResult,
    domainCategoryMappings,
    initialParentCategories,
    settings,
  ] = await Promise.all([
    chrome.storage.local.get<{
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs'),
    getDomainCategoryMappings(),
    getParentCategories(),
    getUserSettings(),
  ])
  const { savedTabs = [] } = savedTabsResult
  const filteredTabs = filterItemsBySavableUrl(
    tabs,
    settings.excludePatterns ?? [],
  )
  const groupedTabs = buildGroupedTabsByDomain(savedTabs)
  console.log('既存タブグループ数:', savedTabs.length)
  console.log('重複除外済みタブグループ数:', groupedTabs.size)
  console.log('ドメインマッピング:', domainCategoryMappings)
  const parentCategories = await normalizeParentCategoriesIfNeeded(
    initialParentCategories,
  )
  logParentCategorySnapshot(parentCategories)
  const tabsWithDomains = getTabsWithDomains(filteredTabs)
  const missingDomainSet = tabsWithDomains.reduce<Set<string>>(
    (domains, { domain }) => {
      if (!groupedTabs.has(domain)) {
        domains.add(domain)
      }
      return domains
    },
    new Set(),
  )
  const missingDomains = [...missingDomainSet]
  const createdGroups = await Promise.all(
    missingDomains.map(async (domain) => {
      console.log(`新しいドメインを処理: ${domain}`)
      const group = await createGroupForDomain(
        domain,
        domainCategoryMappings,
        parentCategories,
      )
      return { domain, group }
    }),
  )
  for (const { domain, group } of createdGroups) {
    groupedTabs.set(domain, group)
  }
  const urlRecords = await Promise.all(
    tabsWithDomains.map(async ({ domain, tab, url }) => {
      const group = groupedTabs.get(domain)!
      if (!missingDomainSet.has(domain)) {
        console.log(`既存のドメインに追加: ${domain}`)
      }
      const urlRecord = await createOrUpdateUrlRecord(url, tab.title || '')
      return { group, urlRecord }
    }),
  )
  for (const item of urlRecords) {
    const { group, urlRecord } = item
    if (!group.urlIds) {
      group.urlIds = []
    }
    const { urlIds } = group
    const existingUrlIds = new Set(urlIds)
    if (!existingUrlIds.has(urlRecord.id)) {
      urlIds.push(urlRecord.id)
    }
  }
  const groupArray = [...groupedTabs.values()]
  console.log('保存前の重複チェック:', groupArray.length)
  const uniqueGroups = dedupeGroupsById(groupArray)
  console.log('重複除去後のタブグループ数:', uniqueGroups.length)
  await chrome.storage.local.set({
    savedTabs: uniqueGroups,
  })
  const autoCategorizeTasks = uniqueGroups.reduce<Promise<void>[]>(
    (tasks, group) => {
      if (group.categoryKeywords && group.categoryKeywords.length > 0) {
        tasks.push(autoCategorizeTabs(group.id))
      }
      return tasks
    },
    [],
  )
  await Promise.all(autoCategorizeTasks)
} // タブ保存時に自動分類も行うようにsaveTabsを拡張
const saveTabsWithAutoCategory = async (tabs: chrome.tabs.Tab[]) => {
  await saveTabs(tabs)
  const settings = await getUserSettings()
  const filteredTabs = filterItemsBySavableUrl(
    tabs,
    settings.excludePatterns ?? [],
  )

  // 保存したタブグループのIDを取得
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: import('@/types/storage').TabGroup[]
  }>('savedTabs')
  const uniqueDomains = getUniqueDomainsFromTabs(filteredTabs)

  // 各ドメインで自動カテゴライズを実行
  const groupByDomain = new Map(savedTabs.map((group) => [group.domain, group]))
  await Promise.all(
    [...uniqueDomains].flatMap((domain) => {
      const group = groupByDomain.get(domain)
      return group && (group.categoryKeywords?.length ?? 0) > 0
        ? [autoCategorizeTabs(group.id)]
        : []
    }),
  )
} // 親カテゴリの domains と domainNames を更新する関数
const updateCategoryDomains = async (
  category: ParentCategory,
): Promise<void> => {
  const categories = await getParentCategories()
  const updatedCategories = categories.map((c) =>
    c.id === category.id ? category : c,
  )
  await saveParentCategories(updatedCategories)
} // TabGroup IDからグループを取得する関数
const getTabGroupById = async (groupId: string): Promise<TabGroup | null> => {
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: import('@/types/storage').TabGroup[]
  }>('savedTabs')
  return savedTabs.find((group: TabGroup) => group.id === groupId) || null
}

export { migrateToUrlsStorage } from './url-migration'
export {
  assignDomainToCategory,
  getTabDomain,
  getTabsWithDomains,
  getUniqueDomainsFromTabs,
  migrateParentCategoriesToDomainNames,
  saveTabs,
  saveTabsWithAutoCategory,
  updateCategoryDomains,
}
