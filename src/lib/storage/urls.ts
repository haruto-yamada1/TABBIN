import { v4 as uuidv4 } from 'uuid'

import { getChromeStorageOnChanged } from '@/lib/browser/chrome-storage'
import type { CustomProject, TabGroup, UrlRecord } from '@/types/storage'

/** セッション中のインメモリキャッシュ */
let urlRecordsCache: UrlRecord[] | null = null
let urlRecordMutationQueue: Promise<void> = Promise.resolve()
let registeredUrlStorageOnChanged: typeof chrome.storage.onChanged | null = null
let urlCacheGeneration = 0

type UrlRecordInput = {
  url: string
  title: string
  favIconUrl?: string
}

type CreateOrUpdateUrlRecordOptions = {
  preserveExistingOnDuplicate?: boolean
}

/** キャッシュを無効化する（書き込み後・外部更新検知後に呼ぶ） */
const invalidateUrlCache = (): void => {
  urlRecordsCache = null
  urlCacheGeneration += 1
}

const handleUrlStorageChange = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): void => {
  if (areaName === 'local' && Object.hasOwn(changes, 'urls')) {
    invalidateUrlCache()
  }
}

const ensureUrlCacheInvalidationListener = (): boolean => {
  const storageOnChanged = getChromeStorageOnChanged()
  if (registeredUrlStorageOnChanged === storageOnChanged) {
    return storageOnChanged !== null
  }

  if (
    registeredUrlStorageOnChanged !== null &&
    typeof registeredUrlStorageOnChanged.removeListener === 'function'
  ) {
    registeredUrlStorageOnChanged.removeListener(handleUrlStorageChange)
  }

  invalidateUrlCache()
  registeredUrlStorageOnChanged = null
  if (storageOnChanged === null) {
    return false
  }

  storageOnChanged.addListener(handleUrlStorageChange)
  registeredUrlStorageOnChanged = storageOnChanged
  return true
}

/**
 * すべてのURLレコードを取得する
 */
const getUrlRecords = async (): Promise<UrlRecord[]> => {
  const canUseCache = ensureUrlCacheInvalidationListener()
  if (canUseCache && urlRecordsCache !== null) {
    return urlRecordsCache
  }
  const readGeneration = urlCacheGeneration
  const readStorageOnChanged = registeredUrlStorageOnChanged
  try {
    const { urls } = await chrome.storage.local.get('urls')
    const storedUrls: unknown = urls
    if (!Array.isArray(storedUrls)) {
      return []
    }
    const urlRecords = storedUrls.filter(
      (item): item is UrlRecord =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        'url' in item,
    )
    if (
      canUseCache &&
      urlCacheGeneration === readGeneration &&
      registeredUrlStorageOnChanged === readStorageOnChanged
    ) {
      urlRecordsCache = urlRecords
    }
    return urlRecords
  } catch (error) {
    console.error('URLレコード取得エラー:', error)
    return []
  }
}
/**
 * URLレコードを保存する
 */
const saveUrlRecordsUnsafe = async (urlRecords: UrlRecord[]): Promise<void> => {
  try {
    await chrome.storage.local.set({
      urls: urlRecords,
    })
    invalidateUrlCache()
    console.log(`${urlRecords.length}個のURLレコードを保存しました`)
  } catch (error) {
    console.error('URLレコード保存エラー:', error)
    throw error
  }
}
/**
 * 指定されたIDのURLレコードを取得する
 */
const getUrlRecordById = async (id: string): Promise<UrlRecord | null> => {
  const urlRecords = await getUrlRecords()
  return urlRecords.find((record) => record.id === id) ?? null
}
/**
 * 複数のIDからURLレコードを取得する
 */
const getUrlRecordsByIds = async (ids: string[]): Promise<UrlRecord[]> => {
  const urlRecords = await getUrlRecords()
  const recordMap = new Map(urlRecords.map((record) => [record.id, record]))
  return ids.flatMap((id) => {
    const record = recordMap.get(id)
    return record ? [record] : []
  })
}
/**
 * URLからURLレコードを検索する
 */
const findUrlRecordByUrl = async (url: string): Promise<UrlRecord | null> => {
  const urlRecords = await getUrlRecords()
  return urlRecords.find((record) => record.url === url) ?? null
}
/**
 * 新しいURLレコードを作成または既存のものを更新する
 */
const createOrUpdateUrlRecordUnsafe = async (
  url: string,
  title: string,
  favIconUrl?: string,
  options: CreateOrUpdateUrlRecordOptions = {},
): Promise<UrlRecord> => {
  const urlRecords = await getUrlRecords()

  // 既存のURLレコードを検索
  const existingRecord = urlRecords.find((record) => record.url === url)
  if (existingRecord) {
    if (options.preserveExistingOnDuplicate) {
      return existingRecord
    }

    // 既存のレコードを更新
    const updatedRecord: UrlRecord = {
      ...existingRecord,
      favIconUrl,
      savedAt: Date.now(), // 更新時刻を記録
      title,
    }
    const updatedRecords = urlRecords.map((record) =>
      record.id === existingRecord.id ? updatedRecord : record,
    )
    await saveUrlRecordsUnsafe(updatedRecords)
    return updatedRecord
  }
  // 新しいレコードを作成
  const newRecord: UrlRecord = {
    favIconUrl,
    id: uuidv4(),
    savedAt: Date.now(),
    title,
    url,
  }
  await saveUrlRecordsUnsafe([...urlRecords, newRecord])
  return newRecord
}

/**
 * 複数URLレコードを一括で作成または更新する
 */
const createOrUpdateUrlRecordsBatchUnsafe = async (
  inputs: UrlRecordInput[],
  options: CreateOrUpdateUrlRecordOptions = {},
): Promise<Map<string, UrlRecord>> => {
  const normalizedInputs = inputs.reduce<UrlRecordInput[]>((items, input) => {
    const normalizedInput = {
      ...input,
      url: input.url.trim(),
    }
    if (normalizedInput.url.length > 0) {
      items.push(normalizedInput)
    }
    return items
  }, [])

  if (normalizedInputs.length === 0) {
    return new Map()
  }

  const now = Date.now()
  let offset = 0
  const existingRecords = await getUrlRecords()
  const records = [...existingRecords]
  const recordIndexByUrl = new Map(
    records.map((record, index) => [record.url, index]),
  )
  const resolvedRecordByUrl = new Map<string, UrlRecord>()

  for (const input of normalizedInputs) {
    const recordIndex = recordIndexByUrl.get(input.url)
    if (recordIndex === undefined) {
      const newRecord: UrlRecord = {
        favIconUrl: input.favIconUrl,
        id: uuidv4(),
        savedAt: now + offset,
        title: input.title,
        url: input.url,
      }
      offset += 1
      records.push(newRecord)
      recordIndexByUrl.set(input.url, records.length - 1)
      resolvedRecordByUrl.set(input.url, newRecord)
      continue
    }

    const existingRecord = records[recordIndex]
    if (options.preserveExistingOnDuplicate) {
      resolvedRecordByUrl.set(input.url, existingRecord)
      continue
    }

    const updatedRecord: UrlRecord = {
      ...existingRecord,
      favIconUrl: input.favIconUrl,
      savedAt: now + offset,
      title: input.title,
    }
    offset += 1
    records[recordIndex] = updatedRecord
    resolvedRecordByUrl.set(input.url, updatedRecord)
  }

  await saveUrlRecordsUnsafe(records)
  return resolvedRecordByUrl
}

const enqueueUrlRecordMutation = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const result = urlRecordMutationQueue.then(operation, operation)
  urlRecordMutationQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

const withUrlRecordMutation = async <T>(
  operation: () => Promise<T>,
): Promise<T> => enqueueUrlRecordMutation(operation)

const saveUrlRecords = async (urlRecords: UrlRecord[]): Promise<void> =>
  enqueueUrlRecordMutation(async () => saveUrlRecordsUnsafe(urlRecords))

const createOrUpdateUrlRecord = async (
  url: string,
  title: string,
  favIconUrl?: string,
  options: CreateOrUpdateUrlRecordOptions = {},
): Promise<UrlRecord> =>
  enqueueUrlRecordMutation(async () =>
    createOrUpdateUrlRecordUnsafe(url, title, favIconUrl, options),
  )

const createOrUpdateUrlRecordsBatch = async (
  inputs: UrlRecordInput[],
  options: CreateOrUpdateUrlRecordOptions = {},
): Promise<Map<string, UrlRecord>> =>
  enqueueUrlRecordMutation(async () =>
    createOrUpdateUrlRecordsBatchUnsafe(inputs, options),
  )
/**
 * URLレコードを削除する（参照されていない場合のみ）
 */
const deleteUrlRecordUnsafe = async (id: string): Promise<boolean> => {
  // 参照チェック（SavedTabsとCustomProjectsで使用されていないか確認）
  const isReferenced = await isUrlRecordReferenced(id)
  if (isReferenced) {
    console.log(`URLレコード ${id} は他の場所で参照されているため削除しません`)
    return false
  }
  const urlRecords = await getUrlRecords()
  const filteredRecords = urlRecords.filter((record) => record.id !== id)
  if (filteredRecords.length < urlRecords.length) {
    await saveUrlRecordsUnsafe(filteredRecords)
    console.log(`URLレコード ${id} を削除しました`)
    return true
  }
  return false
}

const deleteUrlRecord = async (id: string): Promise<boolean> =>
  enqueueUrlRecordMutation(async () => deleteUrlRecordUnsafe(id))
/**
 * URLレコードが他の場所で参照されているかチェックする
 */
const isUrlRecordReferenced = async (urlId: string): Promise<boolean> => {
  try {
    // SavedTabsとCustomProjectsは独立しているため並列取得
    const [savedTabsResult, customProjectsResult] = await Promise.all([
      chrome.storage.local.get<{
        savedTabs?: TabGroup[]
      }>('savedTabs'),
      chrome.storage.local.get<{
        customProjects?: CustomProject[]
      }>('customProjects'),
    ])
    const { savedTabs = [] } = savedTabsResult
    const { customProjects = [] } = customProjectsResult

    const referencedUrlIds = new Set([
      ...savedTabs.flatMap((tabGroup) => tabGroup.urlIds ?? []),
      ...customProjects.flatMap((project) => project.urlIds ?? []),
    ])
    return referencedUrlIds.has(urlId)
  } catch (error) {
    console.error('URL参照チェック中にエラー:', error)
    return true // エラー時は安全のため参照されているとみなす
  }
}
/**
 * 使用されていないURLレコードをクリーンアップする
 */
const cleanupUnreferencedUrlsUnsafe = async (): Promise<number> => {
  try {
    const [urlRecords, savedTabsResult, customProjectsResult] =
      await Promise.all([
        getUrlRecords(),
        chrome.storage.local.get<{
          savedTabs?: TabGroup[]
        }>('savedTabs'),
        chrome.storage.local.get<{
          customProjects?: CustomProject[]
        }>('customProjects'),
      ])
    const { savedTabs = [] } = savedTabsResult
    const { customProjects = [] } = customProjectsResult
    const referencedIds = new Set<string>()

    // SavedTabsから参照されているURLIDを収集
    for (const tabGroup of savedTabs) {
      if (!tabGroup.urlIds) {
        continue
      }
      for (const id of tabGroup.urlIds) {
        referencedIds.add(id)
      }
    }

    // CustomProjectsから参照されているURLIDを収集
    for (const project of customProjects) {
      if (!project.urlIds) {
        continue
      }
      for (const id of project.urlIds) {
        referencedIds.add(id)
      }
    }

    // 未参照のURLレコードをフィルタリング
    const referencedRecords = urlRecords.filter((record) =>
      referencedIds.has(record.id),
    )
    const deletedCount = urlRecords.length - referencedRecords.length
    if (deletedCount > 0) {
      await saveUrlRecordsUnsafe(referencedRecords)
      console.log(
        `${deletedCount}個の未参照URLレコードをクリーンアップしました`,
      )
    }
    return deletedCount
  } catch (error) {
    console.error('URLクリーンアップ中にエラー:', error)
    return 0
  }
}

const cleanupUnreferencedUrls = async (): Promise<number> =>
  enqueueUrlRecordMutation(cleanupUnreferencedUrlsUnsafe)

/**
 * 重複するURLレコードを統合する
 */
const deduplicateUrlRecordsUnsafe = async (): Promise<number> => {
  try {
    const urlRecords = await getUrlRecords()
    const urlMap = new Map<string, UrlRecord>()
    const duplicateIds: string[] = []
    const replacementIdMap = new Map<string, string>()

    // URLをキーとして重複をチェック
    for (const record of urlRecords) {
      const existingRecord = urlMap.get(record.url)
      if (!existingRecord) {
        urlMap.set(record.url, record)
        continue
      }
      // 重複が見つかった場合、より新しいレコードを保持
      if (record.savedAt > existingRecord.savedAt) {
        duplicateIds.push(existingRecord.id)
        replacementIdMap.set(existingRecord.id, record.id)
        urlMap.set(record.url, record)
      } else {
        duplicateIds.push(record.id)
        replacementIdMap.set(record.id, existingRecord.id)
      }
    }
    if (duplicateIds.length > 0) {
      // 重複IDの参照を更新
      await updateUrlReferencesUnsafe(duplicateIds, replacementIdMap)

      // 重複レコードを削除
      const deduplicatedRecords = [...urlMap.values()]
      await saveUrlRecordsUnsafe(deduplicatedRecords)
      console.log(`${duplicateIds.length}個の重複URLレコードを統合しました`)
    }
    return duplicateIds.length
  } catch (error) {
    console.error('URL重複統合中にエラー:', error)
    return 0
  }
}

const deduplicateUrlRecords = async (): Promise<number> =>
  enqueueUrlRecordMutation(deduplicateUrlRecordsUnsafe)

const remapReferenceKeys = <T>(
  values: Record<string, T> | undefined,
  duplicateIdSet: ReadonlySet<string>,
  replacementIdMap: ReadonlyMap<string, string>,
): Record<string, T> | undefined => {
  if (!values) {
    return values
  }

  let changed = false
  const remapped = new Map(Object.entries(values))
  for (const [id, value] of Object.entries(values)) {
    if (!duplicateIdSet.has(id)) {
      continue
    }
    const replacementId = replacementIdMap.get(id)
    if (!replacementId || replacementId === id) {
      continue
    }
    const hasReplacement = remapped.has(replacementId)
    remapped.delete(id)
    if (!hasReplacement) {
      remapped.set(replacementId, value)
    }
    changed = true
  }
  return changed ? Object.fromEntries(remapped) : values
}

/**
 * URLの参照を更新する（重複統合時に使用）
 */
// TODO(#557): SavedTabs/CustomProjects の重複ロジックを共通化して複雑度を削減する。
// eslint-disable-next-line eslint/complexity
const updateUrlReferencesUnsafe = async (
  duplicateIds: string[],
  replacementIdMap: Map<string, string>,
): Promise<void> => {
  try {
    // SavedTabsの参照を更新
    const { savedTabs = [] } = await chrome.storage.local.get<{
      savedTabs?: TabGroup[]
    }>('savedTabs')
    let tabsUpdated = false
    const duplicateIdSet = new Set(duplicateIds)
    for (const tabGroup of savedTabs) {
      const updatedIds = tabGroup.urlIds?.map((id: string) => {
        if (duplicateIdSet.has(id)) {
          return replacementIdMap.get(id) || id // eslint-disable-line typescript/prefer-nullish-coalescing -- replacementIdMap.get() could return empty string
        }
        return id
      })
      if (
        updatedIds &&
        JSON.stringify(updatedIds) !== JSON.stringify(tabGroup.urlIds)
      ) {
        tabGroup.urlIds = updatedIds
        tabsUpdated = true
      }
      const updatedSubCategories = remapReferenceKeys(
        tabGroup.urlSubCategories,
        duplicateIdSet,
        replacementIdMap,
      )
      if (updatedSubCategories !== tabGroup.urlSubCategories) {
        tabGroup.urlSubCategories = updatedSubCategories
        tabsUpdated = true
      }
    }
    if (tabsUpdated) {
      await chrome.storage.local.set({
        savedTabs,
      })
    }

    // CustomProjectsの参照を更新
    const { customProjects = [] } = await chrome.storage.local.get<{
      customProjects?: CustomProject[]
    }>('customProjects')
    let projectsUpdated = false
    for (const project of customProjects) {
      const updatedIds = project.urlIds?.map((id: string) => {
        if (duplicateIdSet.has(id)) {
          // `||` needed: replacementIdMap.get() could return empty string
          // eslint-disable-next-line typescript/prefer-nullish-coalescing
          return replacementIdMap.get(id) || id
        }
        return id
      })
      if (
        updatedIds &&
        JSON.stringify(updatedIds) !== JSON.stringify(project.urlIds)
      ) {
        project.urlIds = updatedIds
        projectsUpdated = true
      }
      const updatedMetadata = remapReferenceKeys(
        project.urlMetadata,
        duplicateIdSet,
        replacementIdMap,
      )
      if (updatedMetadata !== project.urlMetadata) {
        project.urlMetadata = updatedMetadata
        projectsUpdated = true
      }
    }
    if (projectsUpdated) {
      await chrome.storage.local.set({
        customProjects,
      })
    }
  } catch (error) {
    console.error('URL参照更新中にエラー:', error)
  }
}

const updateUrlReferences = async (
  duplicateIds: string[],
  replacementIdMap: Map<string, string>,
): Promise<void> =>
  enqueueUrlRecordMutation(async () =>
    updateUrlReferencesUnsafe(duplicateIds, replacementIdMap),
  )

export {
  cleanupUnreferencedUrls,
  createOrUpdateUrlRecord,
  createOrUpdateUrlRecordsBatch,
  deduplicateUrlRecords,
  deleteUrlRecord,
  findUrlRecordByUrl,
  getUrlRecordById,
  getUrlRecords,
  getUrlRecordsByIds,
  invalidateUrlCache,
  isUrlRecordReferenced,
  saveUrlRecords,
  updateUrlReferences,
  withUrlRecordMutation,
}
