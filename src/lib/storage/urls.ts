import { v4 as uuidv4 } from 'uuid'

import type { UrlRecord } from '@/types/storage'

/** セッション中のインメモリキャッシュ */
let urlRecordsCache: UrlRecord[] | null = null

interface UrlRecordInput {
  url: string
  title: string
  favIconUrl?: string
}

interface CreateOrUpdateUrlRecordOptions {
  preserveExistingOnDuplicate?: boolean
}

/** キャッシュを無効化する（書き込み後・外部更新検知後に呼ぶ） */
const invalidateUrlCache = (): void => {
  urlRecordsCache = null
}
/**
 * すべてのURLレコードを取得する
 */
const getUrlRecords = async (): Promise<UrlRecord[]> => {
  if (urlRecordsCache !== null) {
    return urlRecordsCache
  }
  try {
    const { urls } = await chrome.storage.local.get('urls')
    if (!Array.isArray(urls)) {
      return []
    }
// eslint-disable-next-line typescript/no-unsafe-type-assertion
    urlRecordsCache = urls as UrlRecord[] // eslint-disable-line typescript/no-unnecessary-type-assertion
    return urlRecordsCache
  } catch (error) {
    console.error('URLレコード取得エラー:', error)
    return []
  }
}
/**
 * URLレコードを保存する
 */
const saveUrlRecords = async (urlRecords: UrlRecord[]): Promise<void> => {
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
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  return urlRecords.find((record) => record.id === id) || null
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
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  return urlRecords.find((record) => record.url === url) || null
}
/**
 * 新しいURLレコードを作成または既存のものを更新する
 */
const createOrUpdateUrlRecord = async (
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
    await saveUrlRecords(updatedRecords)
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
  await saveUrlRecords([...urlRecords, newRecord])
  return newRecord
}

/**
 * 複数URLレコードを一括で作成または更新する
 */
const createOrUpdateUrlRecordsBatch = async (
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
    if (recordIndex == null) {
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

  await saveUrlRecords(records)
  return resolvedRecordByUrl
}
/**
 * URLレコードを削除する（参照されていない場合のみ）
 */
const deleteUrlRecord = async (id: string): Promise<boolean> => {
  // 参照チェック（SavedTabsとCustomProjectsで使用されていないか確認）
  const isReferenced = await isUrlRecordReferenced(id)
  if (isReferenced) {
    console.log(`URLレコード ${id} は他の場所で参照されているため削除しません`)
    return false
  }
  const urlRecords = await getUrlRecords()
  const filteredRecords = urlRecords.filter((record) => record.id !== id)
  if (filteredRecords.length < urlRecords.length) {
    await saveUrlRecords(filteredRecords)
    console.log(`URLレコード ${id} を削除しました`)
    return true
  }
  return false
}
/**
 * URLレコードが他の場所で参照されているかチェックする
 */
const isUrlRecordReferenced = async (urlId: string): Promise<boolean> => {
  try {
    // SavedTabsとCustomProjectsは独立しているため並列取得
    const [savedTabsResult, customProjectsResult] = await Promise.all([
      chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
        savedTabs?: import('@/types/storage').TabGroup[]
      }>('savedTabs'),
      chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
        customProjects?: import('@/types/storage').CustomProject[]
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
const cleanupUnreferencedUrls = async (): Promise<number> => {
  try {
    const [urlRecords, savedTabsResult, customProjectsResult] =
      await Promise.all([
        getUrlRecords(),
        chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
          savedTabs?: import('@/types/storage').TabGroup[]
        }>('savedTabs'),
        chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
          customProjects?: import('@/types/storage').CustomProject[]
        }>('customProjects'),
      ])
    const { savedTabs = [] } = savedTabsResult
    const { customProjects = [] } = customProjectsResult
    const referencedIds = new Set<string>()

    // SavedTabsから参照されているURLIDを収集
    for (const tabGroup of savedTabs) {
      if (tabGroup.urlIds) {
        for (const id of tabGroup.urlIds) {
          referencedIds.add(id)
        }
      }
    }

    // CustomProjectsから参照されているURLIDを収集
    for (const project of customProjects) {
      if (project.urlIds) {
        for (const id of project.urlIds) {
          referencedIds.add(id)
        }
      }
    }

    // 未参照のURLレコードをフィルタリング
    const referencedRecords = urlRecords.filter((record) =>
      referencedIds.has(record.id),
    )
    const deletedCount = urlRecords.length - referencedRecords.length
    if (deletedCount > 0) {
      await saveUrlRecords(referencedRecords)
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
/**
 * 重複するURLレコードを統合する
 */
const deduplicateUrlRecords = async (): Promise<number> => {
  try {
    const urlRecords = await getUrlRecords()
    const urlMap = new Map<string, UrlRecord>()
    const duplicateIds: string[] = []
    const replacementIdMap = new Map<string, string>()

    // URLをキーとして重複をチェック
    for (const record of urlRecords) {
      const existingRecord = urlMap.get(record.url)
      if (existingRecord) {
        // 重複が見つかった場合、より新しいレコードを保持
        if (record.savedAt > existingRecord.savedAt) {
          duplicateIds.push(existingRecord.id)
          replacementIdMap.set(existingRecord.id, record.id)
          urlMap.set(record.url, record)
        } else {
          duplicateIds.push(record.id)
          replacementIdMap.set(record.id, existingRecord.id)
        }
      } else {
        urlMap.set(record.url, record)
      }
    }
    if (duplicateIds.length > 0) {
      // 重複IDの参照を更新
      await updateUrlReferences(duplicateIds, replacementIdMap)

      // 重複レコードを削除
      const deduplicatedRecords = [...urlMap.values()]
      await saveUrlRecords(deduplicatedRecords)
      console.log(`${duplicateIds.length}個の重複URLレコードを統合しました`)
    }
    return duplicateIds.length
  } catch (error) {
    console.error('URL重複統合中にエラー:', error)
    return 0
  }
}
/**
 * URLの参照を更新する（重複統合時に使用）
 */
const updateUrlReferences = async (
  duplicateIds: string[],
  replacementIdMap: Map<string, string>,
): Promise<void> => {
  try {
    // SavedTabsの参照を更新
    const { savedTabs = [] } = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
      savedTabs?: import('@/types/storage').TabGroup[]
    }>('savedTabs')
    let tabsUpdated = false
    const duplicateIdSet = new Set(duplicateIds)
    for (const tabGroup of savedTabs) {
      if (tabGroup.urlIds) {
        const updatedIds = tabGroup.urlIds.map((id: string) => {
          if (duplicateIdSet.has(id)) {
// eslint-disable-next-line typescript/prefer-nullish-coalescing
            return replacementIdMap.get(id) || id
          }
          return id
        })
        if (JSON.stringify(updatedIds) !== JSON.stringify(tabGroup.urlIds)) {
          tabGroup.urlIds = updatedIds
          tabsUpdated = true
        }
      }
    }
    if (tabsUpdated) {
      await chrome.storage.local.set({
        savedTabs,
      })
    }

    // CustomProjectsの参照を更新
    const { customProjects = [] } = await chrome.storage.local.get<{
// eslint-disable-next-line typescript/consistent-type-imports
      customProjects?: import('@/types/storage').CustomProject[]
    }>('customProjects')
    let projectsUpdated = false
    for (const project of customProjects) {
      if (project.urlIds) {
        const updatedIds = project.urlIds.map((id: string) => {
          if (duplicateIdSet.has(id)) {
// eslint-disable-next-line typescript/prefer-nullish-coalescing
            return replacementIdMap.get(id) || id
          }
          return id
        })
        if (JSON.stringify(updatedIds) !== JSON.stringify(project.urlIds)) {
          project.urlIds = updatedIds
          projectsUpdated = true
        }
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
}
