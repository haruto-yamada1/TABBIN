import { v4 as uuidv4 } from 'uuid'

import { redactUrlForLog } from '@/lib/logging/redact-url'
import { filterItemsBySavableUrl } from '@/lib/url-filter'
import type {
  DomainCategorySettings,
  DomainParentCategoryMapping,
  ParentCategory,
  SubCategoryKeyword,
  TabGroup,
} from '@/types/storage'
import {
  domainMatches,
  hasNormalizedDomain,
  normalizeDomainLookupKey,
} from '@/utils/domain-normalize'

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
      return {
        ...category,
        domains: [...category.domains, domainId],
        domainNames: hasNormalizedDomain(domainNames, tabGroup.domain)
          ? domainNames
          : [...domainNames, tabGroup.domain],
      }
    }
    // 他のカテゴリからは削除（重複を避けるため）
    return {
      ...category,
      domains: category.domains.filter((id) => id !== domainId),
      domainNames: tabGroup
        ? domainNames.filter(
            (domain) => !domainMatches(domain, tabGroup.domain),
          )
        : domainNames,
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
  const domainMapping = domainCategoryMappings.find((m) =>
    domainMatches(m.domain, domain),
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
  for (const category of parentCategories) {
    if (!Array.isArray(category.domainNames)) {
      console.log(`カテゴリ「${category.name}」のdomainNamesが不正です`)
      continue
    }
    console.log(`カテゴリ「${category.name}」のdomainNamesで検索:`, {
      domainCount: category.domainNames.length,
      searchDomain: redactUrlForLog(domain),
    })
    if (hasNormalizedDomain(category.domainNames, domain)) {
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
  const updatedCategory: ParentCategory = {
    ...match.category,
    domainNames: hasNormalizedDomain(domainNames, domain)
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

const mergeCategoryKeywords = (
  a: readonly SubCategoryKeyword[] | undefined,
  b: readonly SubCategoryKeyword[] | undefined,
): SubCategoryKeyword[] => {
  const byName = new Map<string, Set<string>>()
  for (const ck of [...(a ?? []), ...(b ?? [])]) {
    let set = byName.get(ck.categoryName)
    if (!set) {
      set = new Set()
      byName.set(ck.categoryName, set)
    }
    for (const keyword of ck.keywords) {
      set.add(keyword)
    }
  }
  return [...byName.entries()].map(([categoryName, keywords]) => ({
    categoryName,
    keywords: [...keywords],
  }))
}

/**
 * `domainCategorySettings` を正規化ドメインキーでマージする。
 * 同一ドメインの重複エントリ (legacy スキーム付き + hostname 等) は
 * subCategories / categoryKeywords を union して 1 件に統合し、
 * `.find()` で 2 件目が到達不能の dead data になるのを防ぐ
 * (CodeRabbit PR #626 review)。
 */
const mergeDomainCategorySettings = (
  settings: DomainCategorySettings[],
): DomainCategorySettings[] => {
  const byKey = new Map<string, DomainCategorySettings>()
  let merged = 0
  for (const entry of settings) {
    const normalized = { ...entry, domain: toHostnameOrKeep(entry.domain) }
    const key = normalizeDomainLookupKey(normalized.domain)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, normalized)
      continue
    }
    merged += 1
    existing.subCategories = Array.from(
      new Set([...existing.subCategories, ...normalized.subCategories]),
    )
    existing.categoryKeywords = mergeCategoryKeywords(
      existing.categoryKeywords,
      normalized.categoryKeywords,
    )
  }
  if (merged > 0) {
    console.log(
      `domainCategorySettings の hostname 正規化で ${merged} 件の重複エントリをマージしました`,
    )
  }
  return [...byKey.values()]
}

/**
 * `domainCategoryMappings` を正規化ドメインキーで dedup する。
 * 同一ドメインの競合 (異なる categoryId) は最初のエントリを保持し、
 * 競合を warn して silent に破棄しない (CodeRabbit PR #626 review)。
 */
const dedupDomainCategoryMappings = (
  mappings: DomainParentCategoryMapping[],
): DomainParentCategoryMapping[] => {
  const byKey = new Map<string, DomainParentCategoryMapping>()
  let conflicts = 0
  for (const mapping of mappings) {
    const normalized = { ...mapping, domain: toHostnameOrKeep(mapping.domain) }
    const key = normalizeDomainLookupKey(normalized.domain)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, normalized)
      continue
    }
    if (existing.categoryId !== normalized.categoryId) {
      conflicts += 1
      console.warn(
        `domainCategoryMappings でドメイン ${key} の競合を検出: categoryId ${normalized.categoryId} を破棄し ${existing.categoryId} を保持します`,
      )
    }
  }
  if (conflicts > 0) {
    console.log(
      `domainCategoryMappings の hostname 正規化で ${conflicts} 件の競合を解決しました`,
    )
  }
  return [...byKey.values()]
}

/**
 * `savedTabs` を正規化し、同一正規化ドメインの重複グループを検出して warn する。
 * マージは parentCategories[].domains (TabGroupId 参照) との整合を壊さないよう
 * 行わず、重複を検出した場合のみ警告してユーザー判断に委ねる
 * (CodeRabbit PR #626 review)。
 */
const normalizeSavedTabsAndWarnDuplicates = (
  groups: TabGroup[],
): TabGroup[] => {
  const seen = new Set<string>()
  let duplicates = 0
  const normalized = groups.map((group) => {
    const domain = toHostnameOrKeep(group.domain)
    const key = normalizeDomainLookupKey(domain)
    if (key !== '' && seen.has(key)) {
      duplicates += 1
    } else {
      seen.add(key)
    }
    return { ...group, domain }
  })
  if (duplicates > 0) {
    console.warn(
      `savedTabs に hostname 正規化後も重複するドメイングループが ${duplicates} 件検出されました。手動で統合してください`,
    )
  }
  return normalized
}

const runDomainHostnameMigration = async (): Promise<void> => {
  if (domainHostnameMigrationDone) {
    return
  }
  if (await isDomainHostnameMigrationCompleted()) {
    domainHostnameMigrationDone = true
    return
  }
  try {
    // 各キーを「直前再読み込み → 正規化 → 書き込み」で順次処理し、並行保存
    // (context-menu save 等) との競合で新しいデータを巻き戻さない。
    // 正規化は冪等なので並行書き込み混入でも安全。
    const savedTabsRes = await chrome.storage.local.get<{
      savedTabs?: TabGroup[]
    }>('savedTabs')
    if (Array.isArray(savedTabsRes.savedTabs)) {
      await chrome.storage.local.set({
        savedTabs: normalizeSavedTabsAndWarnDuplicates(savedTabsRes.savedTabs),
      })
    }
    const parentCategoriesRes = await chrome.storage.local.get<{
      parentCategories?: ParentCategory[]
    }>('parentCategories')
    if (Array.isArray(parentCategoriesRes.parentCategories)) {
      await chrome.storage.local.set({
        parentCategories: parentCategoriesRes.parentCategories.map((category) =>
          Array.isArray(category.domainNames)
            ? {
                ...category,
                // 正規化後に同ドメインになる重複を除去 (CodeRabbit PR #626 review)
                domainNames: Array.from(
                  new Set(category.domainNames.map(toHostnameOrKeep)),
                ),
              }
            : category,
        ),
      })
    }
    const settingsRes = await chrome.storage.local.get<{
      domainCategorySettings?: DomainCategorySettings[]
    }>('domainCategorySettings')
    if (Array.isArray(settingsRes.domainCategorySettings)) {
      await chrome.storage.local.set({
        domainCategorySettings: mergeDomainCategorySettings(
          settingsRes.domainCategorySettings,
        ),
      })
    }
    const mappingsRes = await chrome.storage.local.get<{
      domainCategoryMappings?: DomainParentCategoryMapping[]
    }>('domainCategoryMappings')
    if (Array.isArray(mappingsRes.domainCategoryMappings)) {
      await chrome.storage.local.set({
        domainCategoryMappings: dedupDomainCategoryMappings(
          mappingsRes.domainCategoryMappings,
        ),
      })
    }
    // データ正規化後に完了フラグを分離して書く。フラグ書き込み前に並行保存が
    // 入ってもデータは既に hostname 化済みなので安全。
    await chrome.storage.local.set({ domainHostnameMigrationCompleted: true })
    domainHostnameMigrationDone = true
    console.log(
      'ドメインストレージの hostname 化マイグレーションが完了しました',
    )
  } catch (error) {
    console.error('ドメイン hostname 化マイグレーションエラー:', error)
    throw error
  }
}

const migrateDomainStorageToHostname = async (): Promise<void> => {
  // 複数コンテキスト (saved-tabs page 複数起動等) で同時実行されないよう
  // Web Locks で直列化する。ロック取得不可環境 (古いブラウザ) はそのまま実行。
  // 複数コンテキスト (saved-tabs page 複数起動等) での同時実行を Web Locks で直列化する。
  // Locks API は型上は常に存在する扱いだが実行環境によっては未実装なので、
  // 部分型へ安全にキャストして feature-detect する。
  const locksApi = (
    navigator as {
      locks?: {
        request?: (name: string, callback: () => Promise<void>) => Promise<void>
      }
    }
  ).locks
  if (locksApi?.request) {
    await locksApi.request(
      'domainHostnameMigration',
      runDomainHostnameMigration,
    )
  } else {
    await runDomainHostnameMigration()
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
