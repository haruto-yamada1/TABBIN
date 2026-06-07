import { v4 as uuidv4 } from 'uuid'

import type { CustomProject, TabGroup, UrlRecord } from '@/types/storage'

import { invalidateUrlCache } from './urls'

/** モジュールスコープのメモ化フラグ（ページセッション中の重複ストレージアクセスを防ぐ） */
let urlsMigrationDone = false

interface UrlMapEntry {
  id: string
  record: UrlRecord
}

type UrlMap = Map<string, UrlMapEntry>
interface UrlMigrationData {
  existingUrls: UrlRecord[]
  savedTabs: TabGroup[]
  customProjects: CustomProject[]
}

const shouldSkipUrlsMigrationByMemoryFlag = async (): Promise<boolean> => {
  if (!urlsMigrationDone) {
    return false
  }

  const { urlsMigrationCompleted } = await chrome.storage.local.get(
    'urlsMigrationCompleted',
  )

  if (urlsMigrationCompleted) {
    return true
  }

  urlsMigrationDone = false
  return false
}

const isUrlsMigrationCompleted = async (): Promise<boolean> => {
  const { urlsMigrationCompleted } = await chrome.storage.local.get(
    'urlsMigrationCompleted',
  )

  return Boolean(urlsMigrationCompleted) // eslint-disable-line typescript/no-unnecessary-type-conversion
}

const loadUrlMigrationData = async (): Promise<UrlMigrationData> => {
  const [existingUrlsResult, savedTabsResult, customProjectsResult] =
    await Promise.all([
      chrome.storage.local.get('urls'),
      chrome.storage.local.get<{
        // eslint-disable-next-line typescript/consistent-type-imports
        savedTabs?: import('@/types/storage').TabGroup[]
      }>('savedTabs'),
      chrome.storage.local.get<{
        // eslint-disable-next-line typescript/consistent-type-imports
        customProjects?: import('@/types/storage').CustomProject[]
      }>('customProjects'),
    ])

  return {
    existingUrls: Array.isArray(existingUrlsResult.urls)
      ? // eslint-disable-next-line typescript/no-unsafe-type-assertion
        (existingUrlsResult.urls as UrlRecord[]) // eslint-disable-line typescript/no-unnecessary-type-assertion
      : [],
    savedTabs: Array.isArray(savedTabsResult.savedTabs)
      ? savedTabsResult.savedTabs
      : [],
    customProjects: Array.isArray(customProjectsResult.customProjects)
      ? customProjectsResult.customProjects
      : [],
  }
}

const createUrlMap = (existingUrls: UrlRecord[]): UrlMap => {
  const urlMap: UrlMap = new Map()

  for (const record of existingUrls) {
    urlMap.set(record.url, {
      id: record.id,
      record,
    })
  }

  return urlMap
}

const upsertUrlEntry = (
  urlMap: UrlMap,
  legacyUrl: {
    url: string
    title?: string
    savedAt?: number
  },
): UrlMapEntry => {
  const existing = urlMap.get(legacyUrl.url)

  if (existing) {
    if (
      legacyUrl.title &&
      legacyUrl.title.length > existing.record.title.length
    ) {
      existing.record.title = legacyUrl.title
    }

    return existing
  }

  const newRecord: UrlRecord = {
    id: uuidv4(),
    url: legacyUrl.url,
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    title: legacyUrl.title || '',
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    savedAt: legacyUrl.savedAt || Date.now(),
    favIconUrl: undefined,
  }
  const created = {
    id: newRecord.id,
    record: newRecord,
  }

  urlMap.set(legacyUrl.url, created)

  return created
}

const migrateTabGroupUrls = (tabGroup: TabGroup, urlMap: UrlMap): void => {
  if (
    !(tabGroup.urls && Array.isArray(tabGroup.urls) && tabGroup.urls.length > 0)
  ) {
    return
  }

  const urlIds: string[] = []
  const urlSubCategories: Record<string, string> = {}

  for (const urlItem of tabGroup.urls) {
    const urlEntry = upsertUrlEntry(urlMap, urlItem)
    urlIds.push(urlEntry.id)

    if (urlItem.subCategory) {
      urlSubCategories[urlEntry.id] = urlItem.subCategory
    }
  }

  tabGroup.urlIds = urlIds

  if (Object.keys(urlSubCategories).length > 0) {
    tabGroup.urlSubCategories = urlSubCategories
  }

  tabGroup.urls = undefined
  console.log(`TabGroup ${tabGroup.domain}: ${urlIds.length}個のURLを移行`)
}

const migrateProjectUrls = (project: CustomProject, urlMap: UrlMap): void => {
  if (
    !(project.urls && Array.isArray(project.urls) && project.urls.length > 0)
  ) {
    return
  }

  const urlIds: string[] = []
  const urlMetadata: Record<
    string,
    {
      notes?: string
      category?: string
    }
  > = {}

  for (const urlItem of project.urls) {
    const urlEntry = upsertUrlEntry(urlMap, urlItem)
    urlIds.push(urlEntry.id)

    const metadata: {
      notes?: string
      category?: string
    } = {}

    if (urlItem.notes) {
      metadata.notes = urlItem.notes
    }

    if (urlItem.category) {
      metadata.category = urlItem.category
    }

    if (Object.keys(metadata).length > 0) {
      urlMetadata[urlEntry.id] = metadata
    }
  }

  project.urlIds = urlIds

  if (Object.keys(urlMetadata).length > 0) {
    project.urlMetadata = urlMetadata
  }

  project.urls = undefined
  console.log(`Project ${project.name}: ${urlIds.length}個のURLを移行`)
}

const persistUrlsMigrationResult = async (
  urlMap: UrlMap,
  savedTabs: TabGroup[],
  customProjects: CustomProject[],
): Promise<void> => {
  const allUrlRecords = [...urlMap.values()].map((entry) => entry.record)

  await chrome.storage.local.set({
    customProjects,
    savedTabs,
    urls: allUrlRecords,
    urlsMigrationCompleted: true,
  })

  invalidateUrlCache()
  urlsMigrationDone = true

  console.log(
    `URL管理マイグレーション完了: ${allUrlRecords.length}個のURLレコードを作成`,
  )
  console.log(`SavedTabs: ${savedTabs.length}個のタブグループを更新`)
  console.log(`CustomProjects: ${customProjects.length}個のプロジェクトを更新`)
}

/**
 * URL管理の正規化マイグレーション
 * SavedTabsとCustomProjectsのURLsを共通のUrlsストレージに移行する
 */
const migrateToUrlsStorage = async (): Promise<void> => {
  try {
    if (await shouldSkipUrlsMigrationByMemoryFlag()) {
      return
    }

    console.log('URL管理正規化マイグレーションを開始します')

    if (await isUrlsMigrationCompleted()) {
      urlsMigrationDone = true
      console.log('URL管理マイグレーションは既に完了済みです')
      return
    }

    const { existingUrls, savedTabs, customProjects } =
      await loadUrlMigrationData()
    const urlMap = createUrlMap(existingUrls)

    console.log(`既存のURLレコード: ${existingUrls.length}個`)
    console.log(`SavedTabsの処理開始: ${savedTabs.length}個のタブグループ`)

    for (const tabGroup of savedTabs) {
      migrateTabGroupUrls(tabGroup, urlMap)
    }

    console.log(
      `CustomProjectsの処理開始: ${customProjects.length}個のプロジェクト`,
    )

    for (const project of customProjects) {
      migrateProjectUrls(project, urlMap)
    }

    await persistUrlsMigrationResult(urlMap, savedTabs, customProjects)
  } catch (error) {
    console.error('URL管理マイグレーション中にエラーが発生しました:', error)
    throw error
  }
}

export { migrateToUrlsStorage }
