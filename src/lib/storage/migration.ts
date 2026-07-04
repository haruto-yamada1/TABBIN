import { v4 as uuidv4 } from 'uuid'

import { redactUrlForLog } from '@/lib/logging/redact-url'
import { filterItemsBySavableUrl } from '@/lib/url-filter'
import type {
  DomainCategorySettings,
  DomainParentCategoryMapping,
  ParentCategory,
  TabGroup,
} from '@/types/storage'
import { normalizeDomainLookupKey } from '@/utils/domain-normalize'

import {
  getDomainCategoryMappings,
  getParentCategories,
  saveParentCategories,
  updateDomainCategoryMapping,
} from './categories'
import { getUserSettings } from './settings'
import { autoCategorizeTabs, restoreCategorySettings } from './tabs'
import { createOrUpdateUrlRecordsBatch } from './urls'

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
    const domainNames = getCategoryDomainNames(category)
    if (category.id === categoryId) {
      if (!tabGroup || category.domains.includes(domainId)) {
        return category
      }
      const tabGroupDomainKey = normalizeDomainLookupKey(tabGroup.domain)
      return {
        ...category,
        domains: [...category.domains, domainId],
        domainNames: domainNames.some(
          (name) => normalizeDomainLookupKey(name) === tabGroupDomainKey,
        )
          ? domainNames
          : [...domainNames, tabGroup.domain],
      }
    }
    // 他のカテゴリからは削除（重複を避けるため）
    const otherTabGroupDomainKey = tabGroup
      ? normalizeDomainLookupKey(tabGroup.domain)
      : null
    return {
      ...category,
      domains: category.domains.filter((id) => id !== domainId),
      domainNames: domainNames.filter((domain) =>
        otherTabGroupDomainKey !== null
          ? normalizeDomainLookupKey(domain) !== otherTabGroupDomainKey
          : true,
      ),
    }
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
          savedTabs?: TabGroup[]
        }>('savedTabs'),
        chrome.storage.local.get<{
          domainCategoryMappings?: DomainParentCategoryMapping[]
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
        domainNames: category.domainNames,
      })

      // マッピングから検索
      const mappingsForCategory = domainCategoryMappings.filter(
        (m: DomainParentCategoryMapping) => m.categoryId === category.id,
      )
      console.log(
        `  マッピングから見つかったドメイン: ${mappingsForCategory.length}件`,
      )

      // SavedTabsからドメイン名を検索
      const domainsFromTabs = category.domains
        .map((domainId) => {
          // eslint-disable-next-line eslint/max-depth
          const tab = savedTabById.get(domainId)
          return tab?.domain
        })
        .filter((domain): domain is string => domain !== undefined)
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
          ...getCategoryDomainNames(category),
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
    // eslint-disable-next-line eslint/no-useless-return
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
const buildGroupedTabsLookup = (
  savedTabs: TabGroup[],
): Map<string, TabGroup> => {
  const groupedTabs = new Map<string, TabGroup>()
  for (const group of savedTabs) {
    const key = normalizeDomainLookupKey(group.domain)
    if (!groupedTabs.has(key)) {
      groupedTabs.set(key, group)
    }
  }
  return groupedTabs
}
const getCategoryDomainNames = (category: {
  domainNames?: unknown
}): string[] =>
  Array.isArray(category.domainNames)
    ? category.domainNames.filter(
        (domainName): domainName is string => typeof domainName === 'string',
      )
    : []
const logParentCategorySnapshot = (
  parentCategories: ParentCategory[],
): void => {
  console.log('親カテゴリ一覧:', parentCategories)
  for (const category of parentCategories) {
    console.log(
      `カテゴリ「${category.name}」のドメイン名一覧:`,
      getCategoryDomainNames(category),
    )
  }
}
const normalizeParentCategoriesIfNeeded = async (
  parentCategories: ParentCategory[],
): Promise<ParentCategory[]> => {
  const hasEmptyDomainNames = parentCategories.some(
    (cat) => getCategoryDomainNames(cat).length === 0,
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
  const domainKey = normalizeDomainLookupKey(domain)
  const domainMapping = domainCategoryMappings.find(
    (m) => normalizeDomainLookupKey(m.domain) === domainKey,
  )
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
    `ドメイン ${redactUrlForLog(domain)} は親カテゴリ「${category.name}」のマッピングに見つかりました`,
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
  const domainKey = normalizeDomainLookupKey(domain)
  for (const category of parentCategories) {
    if (!Array.isArray(category.domainNames)) {
      console.log(`カテゴリ「${category.name}」のdomainNamesが不正です`)
      continue
    }
    console.log(`カテゴリ「${category.name}」のdomainNamesで検索:`, {
      domainCount: category.domainNames.length,
      searchDomain: redactUrlForLog(domain),
    })
    if (
      category.domainNames.some(
        (d) => normalizeDomainLookupKey(d) === domainKey,
      )
    ) {
      console.log(
        `ドメイン ${redactUrlForLog(domain)} は親カテゴリ「${category.name}」のdomainNamesに見つかりました`,
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
  ) ?? findCategoryByDomainNames(domain, parentCategories)
const assignGroupToCategory = async (
  group: TabGroup,
  domain: string,
  match: DomainCategoryMatch,
): Promise<void> => {
  console.log(
    `ドメイン ${redactUrlForLog(domain)} を親カテゴリ「${match.category.name}」に割り当てます (検出方法: ${match.method})`,
  )
  group.parentCategoryId = match.category.id
  const domainNames = Array.isArray(match.category.domainNames)
    ? match.category.domainNames
    : []
  const assignDomainKey = normalizeDomainLookupKey(domain)
  const updatedCategory: ParentCategory = {
    ...match.category,
    domainNames: domainNames.some(
      (name) => normalizeDomainLookupKey(name) === assignDomainKey,
    )
      ? domainNames
      : [...domainNames, domain],
    domains: [...match.category.domains, group.id],
  }
  await Promise.all([
    updateCategoryDomains(updatedCategory),
    updateDomainCategoryMapping(domain, match.category.id),
  ])
  console.log(
    `ドメイン ${redactUrlForLog(domain)} と親カテゴリのマッピングを更新しました`,
  )
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
    console.log(
      `ドメイン ${redactUrlForLog(domain)} の親カテゴリが見つからないため未分類です`,
    )
    return restoredGroup
  }
  await assignGroupToCategory(restoredGroup, domain, match)
  return restoredGroup
}
const dedupeGroupsById = (groupArray: TabGroup[]): TabGroup[] => {
  const idSet = new Set<string>()
  return groupArray.filter((group) => {
    if (idSet.has(group.id)) {
      console.warn(`重複ID検出: ${group.id} (${redactUrlForLog(group.domain)})`)
      return false
    }
    idSet.add(group.id)
    return true
  })
}
// hostname 形 (`example.com`) を返す。host が取れない URL は保存対象外として null を返す。
// 既有のスキーム付きデータとの混在は normalizeDomainLookupKey 経由の比較で吸収し、
// 保存データは別途 migrateDomainStorageToHostname で hostname へ統一する。
const getTabDomain = (tabUrl: string): string | null => {
  try {
    const parsedUrl = new URL(tabUrl)
    const hostname = parsedUrl.hostname
    return hostname.length > 0 ? hostname : null
  } catch (error) {
    console.error(`Invalid URL: ${redactUrlForLog(tabUrl)}`, error)
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
        const url = new URL(tab.url ?? '')
        const hostname = url.hostname
        return hostname.length > 0 ? [hostname] : []
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
      savedTabs?: TabGroup[]
    }>('savedTabs'),
    getDomainCategoryMappings(),
    getParentCategories(),
    getUserSettings(),
  ])
  const { savedTabs = [] } = savedTabsResult
  const filteredTabs = filterItemsBySavableUrl(tabs, settings.excludePatterns)
  const groupedTabs = buildGroupedTabsByDomain(savedTabs)
  const groupedTabsLookup = buildGroupedTabsLookup(savedTabs)
  console.log('既存タブグループ数:', savedTabs.length)
  console.log('重複除外済みタブグループ数:', groupedTabs.size)
  console.log('ドメインマッピング:', domainCategoryMappings)
  const parentCategories = await normalizeParentCategoriesIfNeeded(
    initialParentCategories,
  )
  logParentCategorySnapshot(parentCategories)
  const tabsWithDomains = getTabsWithDomains(filteredTabs)
  const missingDomainKeys = new Set<string>()
  const missingDomainSet = tabsWithDomains.reduce<Set<string>>(
    (domains, { domain }) => {
      const domainKey = normalizeDomainLookupKey(domain)
      if (
        !groupedTabsLookup.has(domainKey) &&
        !missingDomainKeys.has(domainKey)
      ) {
        domains.add(domain)
        missingDomainKeys.add(domainKey)
      }
      return domains
    },
    new Set(),
  )
  const missingDomains = [...missingDomainSet]
  const createdGroups: { domain: string; group: TabGroup }[] = []
  let currentParentCategories = parentCategories
  for (const domain of missingDomains) {
    console.log(`新しいドメインを処理: ${redactUrlForLog(domain)}`)
    // Parent category assignment updates `domains` and `domainNames` through
    // storage read-modify-write. Process classified domains sequentially and
    // feed the latest category state into the next assignment.
    // eslint-disable-next-line no-await-in-loop
    const group = await createGroupForDomain(
      domain,
      domainCategoryMappings,
      currentParentCategories,
    )
    createdGroups.push({ domain, group })
    if (group.parentCategoryId) {
      // eslint-disable-next-line no-await-in-loop
      currentParentCategories = await getParentCategories()
    }
  }
  for (const { domain, group } of createdGroups) {
    groupedTabs.set(domain, group)
    groupedTabsLookup.set(normalizeDomainLookupKey(domain), group)
  }
  const urlRecordByUrl = await createOrUpdateUrlRecordsBatch(
    tabsWithDomains.map(({ tab, url }) => ({
      title: tab.title ?? '',
      url,
    })),
  )
  for (const { domain, url } of tabsWithDomains) {
    const domainKey = normalizeDomainLookupKey(domain)
    const group = groupedTabsLookup.get(domainKey)
    if (!group) {
      throw new Error(`Domain group not found: ${redactUrlForLog(domain)}`)
    }
    if (!missingDomainKeys.has(domainKey)) {
      console.log(`既存のドメインに追加: ${redactUrlForLog(domain)}`)
    }
    const urlRecord = urlRecordByUrl.get(url)
    if (!urlRecord) {
      throw new Error(
        `URL record not found after batch update: ${redactUrlForLog(url)}`,
      )
    }
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
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
  const filteredTabs = filterItemsBySavableUrl(tabs, settings.excludePatterns)

  // 保存したタブグループのIDを取得
  const { savedTabs = [] } = await chrome.storage.local.get<{
    savedTabs?: TabGroup[]
  }>('savedTabs')
  const uniqueDomains = getUniqueDomainsFromTabs(filteredTabs)

  // 各ドメインで自動カテゴライズを実行
  const groupByDomain = buildGroupedTabsLookup(savedTabs)
  await Promise.all(
    [...uniqueDomains].flatMap((domain) => {
      const group = groupByDomain.get(normalizeDomainLookupKey(domain))
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
    savedTabs?: TabGroup[]
  }>('savedTabs')
  return savedTabs.find((group: TabGroup) => group.id === groupId) ?? null
}

/** モジュールスコープのメモ化フラグ (ページセッション中の重複ストレージアクセスを防ぐ) */
let domainHostnameMigrationDone = false

const isDomainHostnameMigrationCompleted = async (): Promise<boolean> => {
  const { domainHostnameMigrationCompleted } = await chrome.storage.local.get(
    'domainHostnameMigrationCompleted',
  )
  return Boolean(domainHostnameMigrationCompleted)
}

/**
 * スキーム付きドメイン (`https://example.com`) を hostname (`example.com`) へ
 * 正規化し、既存ユーザーのストレージを hostname 形式へ冪等に統一する。
 *
 * 対象: `savedTabs[].domain` / `parentCategories[].domainNames` /
 * `domainCategorySettings[].domain` / `domainCategoryMappings[].domain`。
 * 書き込み経路 (getTabDomain / getDomainFromUrl) は hostname を返すよう
 * 修正済みのため、本 migration で既有のスキーム付きデータを hostname 化して
 * 形式を一本化する (Finding B の根本治療)。
 *
 * 安全性:
 * - 冪等: `normalizeDomainLookupKey` は hostname→hostname で変化なし。完了
 *   フラグ `domainHostnameMigrationCompleted` で再実行を抑制する。
 * - 保守: 正規化結果が有効な hostname (空でなく `://` を含まない) なら採用、
 *   不正値なら元の値を保持してデータを悪化させない。
 * - 対象キーが配列でない場合は書き換えを行わない (存在しないキーは触らない)。
 */
const toHostnameOrKeep = (value: string): string => {
  const key = normalizeDomainLookupKey(value)
  return key.length > 0 && !key.includes('://') ? key : value
}

const migrateDomainStorageToHostname = async (): Promise<void> => {
  if (domainHostnameMigrationDone) {
    return
  }
  if (await isDomainHostnameMigrationCompleted()) {
    domainHostnameMigrationDone = true
    return
  }
  try {
    const [savedTabsRes, parentCategoriesRes, settingsRes, mappingsRes] =
      await Promise.all([
        chrome.storage.local.get<{ savedTabs?: TabGroup[] }>('savedTabs'),
        chrome.storage.local.get<{ parentCategories?: ParentCategory[] }>(
          'parentCategories',
        ),
        chrome.storage.local.get<{
          domainCategorySettings?: DomainCategorySettings[]
        }>('domainCategorySettings'),
        chrome.storage.local.get<{
          domainCategoryMappings?: DomainParentCategoryMapping[]
        }>('domainCategoryMappings'),
      ])

    const patch: Record<string, unknown> = {
      domainHostnameMigrationCompleted: true,
    }
    const savedTabs = savedTabsRes.savedTabs
    if (Array.isArray(savedTabs)) {
      patch.savedTabs = savedTabs.map((group) => ({
        ...group,
        domain: toHostnameOrKeep(group.domain),
      }))
    }
    const parentCategories = parentCategoriesRes.parentCategories
    if (Array.isArray(parentCategories)) {
      patch.parentCategories = parentCategories.map((category) =>
        Array.isArray(category.domainNames)
          ? {
              ...category,
              domainNames: category.domainNames.map(toHostnameOrKeep),
            }
          : category,
      )
    }
    const settings = settingsRes.domainCategorySettings
    if (Array.isArray(settings)) {
      patch.domainCategorySettings = settings.map((entry) => ({
        ...entry,
        domain: toHostnameOrKeep(entry.domain),
      }))
    }
    const mappings = mappingsRes.domainCategoryMappings
    if (Array.isArray(mappings)) {
      patch.domainCategoryMappings = mappings.map((mapping) => ({
        ...mapping,
        domain: toHostnameOrKeep(mapping.domain),
      }))
    }
    await chrome.storage.local.set(patch)
    domainHostnameMigrationDone = true
    console.log(
      'ドメインストレージの hostname 化マイグレーションが完了しました',
    )
  } catch (error) {
    console.error('ドメイン hostname 化マイグレーションエラー:', error)
    throw error
  }
}

export { migrateToUrlsStorage } from './url-migration'
export {
  assignDomainToCategory,
  getTabDomain,
  getTabsWithDomains,
  getUniqueDomainsFromTabs,
  migrateDomainStorageToHostname,
  migrateParentCategoriesToDomainNames,
  saveTabs,
  saveTabsWithAutoCategory,
  updateCategoryDomains,
}
