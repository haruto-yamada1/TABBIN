/**
 * URL・ストレージ操作モジュール
 */

import { redactUrlForLog } from '@/lib/logging/redact-url'
import { removeUrlFromAllCustomProjects } from '@/lib/storage/projects'
import { getUserSettings } from '@/lib/storage/settings'
import { deleteUrlRecord, invalidateUrlCache } from '@/lib/storage/urls'
import type { DraggedUrlInfo } from '@/types/background'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UrlRecord,
} from '@/types/storage'

// ドラッグされたURL情報を一時保存するためのストア
let draggedUrlInfo: DraggedUrlInfo | null = null

/**
 * ドラッグ情報を設定
 */
const setDraggedUrlInfo = (info: DraggedUrlInfo): void => {
  draggedUrlInfo = info
}
/**
 * ドラッグ情報を取得
 */
const getDraggedUrlInfo = (): DraggedUrlInfo | null => draggedUrlInfo
/**
 * ドラッグ情報をクリア
 */
const clearDraggedUrlInfo = (): void => {
  draggedUrlInfo = null
}
interface ComparableUrlKeyOptions {
  readonly ignoreHash?: boolean
  readonly ignoreSearch?: boolean
}

/**
 * URL比較用の安全な key を作成する。
 */
const createComparableUrlKey = (
  rawUrl: string,
  options: ComparableUrlKeyOptions = {},
): string | null => {
  try {
    const url = new URL(rawUrl.trim())
    url.hostname = url.hostname.toLowerCase()

    if (options.ignoreHash) {
      url.hash = ''
    }
    if (options.ignoreSearch) {
      url.search = ''
    }

    return url.toString()
  } catch {
    return null
  }
}

const removeUrlIdFromGroup = (
  group: TabGroup,
  matchedUrlId: string,
  removedGroupIds: string[],
): TabGroup[] => {
  if (!(Array.isArray(group.urlIds) && group.urlIds.includes(matchedUrlId))) {
    return [group]
  }
  const updatedUrlIds = group.urlIds.filter((id) => id !== matchedUrlId)
  const updatedUrlSubCategories = group.urlSubCategories
    ? Object.fromEntries(
        Object.entries(group.urlSubCategories).filter(
          ([urlId]) => urlId !== matchedUrlId,
        ),
      )
    : undefined
  if (updatedUrlIds.length === 0) {
    removedGroupIds.push(group.id)
    return []
  }
  return [
    {
      ...group,
      urlIds: updatedUrlIds,
      urlSubCategories:
        updatedUrlSubCategories &&
        Object.keys(updatedUrlSubCategories).length > 0
          ? updatedUrlSubCategories
          : undefined,
    },
  ]
}
const removeLegacyUrlFromGroup = (
  group: TabGroup,
  targetUrlKey: string,
  removedGroupIds: string[],
): TabGroup[] => {
  if (!Array.isArray(group.urls)) {
    return [group]
  }
  const updatedUrls = group.urls.filter(
    (item) => createComparableUrlKey(item.url) !== targetUrlKey,
  )
  if (updatedUrls.length === group.urls.length) {
    return [group]
  }
  if (updatedUrls.length === 0) {
    removedGroupIds.push(group.id)
    return []
  }
  return [
    {
      ...group,
      urls: updatedUrls,
    },
  ]
}
const updateGroupAfterUrlRemoval = (
  group: TabGroup,
  targetUrlKey: string,
  matchedUrlId: string | undefined,
  removedGroupIds: string[],
): TabGroup[] => {
  if (Array.isArray(group.urlIds)) {
    if (!matchedUrlId) {
      return [group]
    }
    return removeUrlIdFromGroup(group, matchedUrlId, removedGroupIds)
  }
  return removeLegacyUrlFromGroup(group, targetUrlKey, removedGroupIds)
}

interface BulkUrlRemovalStorage {
  customProjects?: CustomProject[]
  parentCategories?: ParentCategory[]
  savedTabs?: TabGroup[]
  urls?: UrlRecord[]
}

interface BulkSavedTabsRemovalResult {
  hasChanges: boolean
  removedGroupIds: string[]
  savedTabs: TabGroup[]
}

interface BulkCustomProjectsRemovalResult {
  customProjects: CustomProject[]
  hasChanges: boolean
}

interface BulkParentCategoriesRemovalResult {
  hasChanges: boolean
  parentCategories: ParentCategory[]
}

const createUrlIdSet = (urlIds: string[]): Set<string> =>
  new Set(urlIds.filter((id) => typeof id === 'string' && id.length > 0))

const removeUrlIdsFromRecord = <T>(
  record: Record<string, T> | undefined,
  urlIds: Set<string>,
): {
  hasChanges: boolean
  record?: Record<string, T>
} => {
  if (!record) {
    return { hasChanges: false }
  }

  const entries = Object.entries(record).filter(([urlId]) => !urlIds.has(urlId))
  const hasChanges = entries.length !== Object.keys(record).length
  if (entries.length === 0) {
    return { hasChanges, record: undefined }
  }

  return {
    hasChanges,
    record: Object.fromEntries(entries),
  }
}

const removeUrlIdsFromSavedTabs = (
  savedTabs: TabGroup[],
  urlIds: Set<string>,
): BulkSavedTabsRemovalResult => {
  let hasChanges = false
  const removedGroupIds: string[] = []
  const updatedTabs: TabGroup[] = []

  for (const group of savedTabs) {
    if (!Array.isArray(group.urlIds)) {
      updatedTabs.push(group)
      continue
    }

    const updatedUrlIds = group.urlIds.filter((id) => !urlIds.has(id))
    if (updatedUrlIds.length === group.urlIds.length) {
      updatedTabs.push(group)
      continue
    }

    hasChanges = true
    if (updatedUrlIds.length === 0) {
      removedGroupIds.push(group.id)
      continue
    }

    const {
      hasChanges: hasSubCategoryChanges,
      record: updatedUrlSubCategories,
    } = removeUrlIdsFromRecord(group.urlSubCategories, urlIds)
    const { urlSubCategories: _urlSubCategories, ...groupWithoutMetadata } =
      group

    updatedTabs.push({
      ...groupWithoutMetadata,
      urlIds: updatedUrlIds,
      ...(hasSubCategoryChanges && updatedUrlSubCategories
        ? { urlSubCategories: updatedUrlSubCategories }
        : {}),
      ...(!hasSubCategoryChanges && group.urlSubCategories
        ? { urlSubCategories: group.urlSubCategories }
        : {}),
    })
  }

  return {
    hasChanges,
    removedGroupIds,
    savedTabs: updatedTabs,
  }
}

const removeUrlIdsFromCustomProjects = (
  customProjects: CustomProject[],
  urlIds: Set<string>,
): BulkCustomProjectsRemovalResult => {
  const now = Date.now()
  let hasChanges = false

  const updatedProjects = customProjects.map((project) => {
    const currentUrlIds = Array.isArray(project.urlIds) ? project.urlIds : []
    const updatedUrlIds = currentUrlIds.filter((id) => !urlIds.has(id))
    const { hasChanges: hasMetadataChanges, record: updatedUrlMetadata } =
      removeUrlIdsFromRecord(project.urlMetadata, urlIds)
    const hasUrlIdChanges = updatedUrlIds.length !== currentUrlIds.length

    if (!(hasUrlIdChanges || hasMetadataChanges)) {
      return project
    }

    hasChanges = true
    const { urlMetadata: _urlMetadata, ...projectWithoutMetadata } = project
    return {
      ...projectWithoutMetadata,
      updatedAt: now,
      urlIds: updatedUrlIds,
      ...(updatedUrlMetadata ? { urlMetadata: updatedUrlMetadata } : {}),
    }
  })

  return {
    customProjects: updatedProjects,
    hasChanges,
  }
}

const removeGroupsFromParentCategories = (
  parentCategories: ParentCategory[],
  groupIds: string[],
): BulkParentCategoriesRemovalResult => {
  if (groupIds.length === 0) {
    return {
      hasChanges: false,
      parentCategories,
    }
  }

  const groupIdsToRemove = new Set(groupIds)
  let hasChanges = false
  const updatedCategories = parentCategories.map((category) => {
    if (!Array.isArray(category.domains)) {
      return category
    }

    const updatedDomains = category.domains.filter(
      (id) => !groupIdsToRemove.has(id),
    )
    if (updatedDomains.length === category.domains.length) {
      return category
    }

    hasChanges = true
    return {
      ...category,
      domains: updatedDomains,
    }
  })

  return {
    hasChanges,
    parentCategories: updatedCategories,
  }
}

const removeUrlRecordsById = (
  urls: UrlRecord[],
  urlIds: Set<string>,
): {
  hasChanges: boolean
  removedCount: number
  urls: UrlRecord[]
} => {
  const updatedUrls = urls.filter((record) => !urlIds.has(record.id))

  return {
    hasChanges: updatedUrls.length !== urls.length,
    removedCount: urls.length - updatedUrls.length,
    urls: updatedUrls,
  }
}

/**
 * URLをストレージから削除する関数（カテゴリ設定とマッピングを保持）
 */
const removeUrlFromStorage = async (url: string): Promise<void> => {
  try {
    const targetUrlKey = createComparableUrlKey(url)
    if (!targetUrlKey) {
      console.log(
        '削除対象URLを比較可能な形式にできないため、削除をスキップしました:',
        redactUrlForLog(url),
      )
      return
    }

    const storageResult = await chrome.storage.local.get<{
      savedTabs?: TabGroup[]
      urls?: UrlRecord[]
    }>(['savedTabs', 'urls'])
    const savedTabs: TabGroup[] = Array.isArray(storageResult.savedTabs)
      ? storageResult.savedTabs
      : []
    const urlRecords = Array.isArray(storageResult.urls)
      ? storageResult.urls
      : []
    const matchedUrlRecord = urlRecords.find(
      (record) => createComparableUrlKey(record.url) === targetUrlKey,
    )
    const matchedUrlId = matchedUrlRecord?.id
    const removedGroupIds: string[] = []

    // URLを含むグループのみを更新（新形式 urlIds / 旧形式 urls の両方に対応）
    const updatedGroups: TabGroup[] = savedTabs.flatMap((group: TabGroup) =>
      updateGroupAfterUrlRemoval(
        group,
        targetUrlKey,
        matchedUrlId,
        removedGroupIds,
      ),
    )

    // 複数グループを単一の read-modify-write で外し、カテゴリ更新の競合を防ぐ。
    await removeFromParentCategories(removedGroupIds, savedTabs)

    // 更新したグループをストレージに保存
    await chrome.storage.local.set({
      savedTabs: updatedGroups,
    })

    if (matchedUrlRecord) {
      await removeUrlFromAllCustomProjects(matchedUrlRecord.url)
      await deleteUrlRecord(matchedUrlRecord.id)
    }

    console.log(`ストレージからURL ${redactUrlForLog(url)} を削除しました`)
  } catch (error) {
    console.error('URLの削除中にエラーが発生しました:', error)
    throw error
  }
}

// eslint-disable-next-line eslint/complexity
const removeUrlRecordsFromStorage = async (
  urlIds: string[],
): Promise<number> => {
  const targetUrlIds = createUrlIdSet(urlIds)
  if (targetUrlIds.size === 0) {
    return 0
  }

  try {
    const storageResult = await chrome.storage.local.get<BulkUrlRemovalStorage>(
      ['savedTabs', 'urls', 'customProjects', 'parentCategories'],
    )
    const savedTabs = Array.isArray(storageResult.savedTabs)
      ? storageResult.savedTabs
      : []
    const urls = Array.isArray(storageResult.urls) ? storageResult.urls : []
    const customProjects = Array.isArray(storageResult.customProjects)
      ? storageResult.customProjects
      : []
    const parentCategories = Array.isArray(storageResult.parentCategories)
      ? storageResult.parentCategories
      : []
    const savedTabsResult = removeUrlIdsFromSavedTabs(savedTabs, targetUrlIds)
    const customProjectsResult = removeUrlIdsFromCustomProjects(
      customProjects,
      targetUrlIds,
    )
    const parentCategoriesResult = removeGroupsFromParentCategories(
      parentCategories,
      savedTabsResult.removedGroupIds,
    )
    const urlsResult = removeUrlRecordsById(urls, targetUrlIds)
    const payload: BulkUrlRemovalStorage = {}

    if (savedTabsResult.hasChanges) {
      payload.savedTabs = savedTabsResult.savedTabs
    }
    if (customProjectsResult.hasChanges) {
      payload.customProjects = customProjectsResult.customProjects
    }
    if (parentCategoriesResult.hasChanges) {
      payload.parentCategories = parentCategoriesResult.parentCategories
    }
    if (urlsResult.hasChanges) {
      payload.urls = urlsResult.urls
    }

    if (Object.keys(payload).length > 0) {
      await chrome.storage.local.set(payload)
      if (urlsResult.hasChanges) {
        invalidateUrlCache()
      }
    }

    console.log(`${urlsResult.removedCount}件のURLレコードを一括削除しました`)
    return urlsResult.removedCount
  } catch (error) {
    console.error('URLレコードの一括削除中にエラーが発生しました:', error)
    throw error
  }
}
/**
 * 空になったグループを親カテゴリから一括削除する。
 */
const removeFromParentCategories = async (
  groupIds: string[],
  savedTabs: TabGroup[],
): Promise<void> => {
  if (groupIds.length === 0) {
    return
  }

  try {
    const groupIdsToRemove = new Set(groupIds)
    const groupsToRemove = savedTabs.filter(
      (group) => groupIdsToRemove.has(group.id) && Boolean(group.domain),
    )
    if (groupsToRemove.length === 0) {
      console.log('削除対象のグループが見つからないか、ドメイン名がありません')
      return
    }

    const categoriesStorage = await chrome.storage.local.get<{
      parentCategories?: ParentCategory[]
    }>('parentCategories')
    const parentCategories: ParentCategory[] =
      categoriesStorage.parentCategories ?? []
    const removalResult = removeGroupsFromParentCategories(
      parentCategories,
      groupsToRemove.map((group) => group.id),
    )
    if (!removalResult.hasChanges) {
      return
    }
    await chrome.storage.local.set({
      parentCategories: removalResult.parentCategories,
    })
    console.log(
      `${groupsToRemove.length}個のグループIDをカテゴリから削除しました（ドメイン名を保持）`,
    )
  } catch (error: unknown) {
    console.error(
      '親カテゴリからの削除中にエラーが発生しました:',
      error instanceof Error ? error.message : error,
    )
  }
}
/**
 * ドラッグ開始処理
 */
const handleUrlDragStarted = (url: string): void => {
  console.log('ドラッグ開始を検知:', redactUrlForLog(url))

  // ドラッグ情報を一時保存
  const dragInfo: DraggedUrlInfo = {
    processed: false,
    timestamp: Date.now(),
    url,
  }
  draggedUrlInfo = dragInfo

  const DRAG_TIMEOUT_MS = 10_000

  // ドラッグ情報の自動タイムアウト（10秒）
  const dragTimeout = setTimeout(() => {
    if (draggedUrlInfo === dragInfo && !dragInfo.processed) {
      console.log('ドラッグ情報のタイムアウト:', redactUrlForLog(dragInfo.url))
      draggedUrlInfo = null
    }
  }, DRAG_TIMEOUT_MS)

  // タイムアウトIDを保存しておくことで、必要に応じてキャンセル可能
  dragInfo.timeoutId = dragTimeout
}
/**
 * ドラッグドロップ処理
 */
const handleUrlDropped = async (
  url: string,
  fromExternal?: boolean,
): Promise<string> => {
  console.log('URLドロップを検知:', redactUrlForLog(url))

  // FromExternal フラグが true の場合のみ処理（外部ドラッグの場合のみ）
  if (fromExternal === true) {
    try {
      const settings = await getUserSettings()
      if (settings.removeTabAfterExternalDrop) {
        await removeUrlFromStorage(url)
        console.log('外部ドロップ後にURLを削除しました:', redactUrlForLog(url))
        return 'removed'
      }
      console.log('設定により削除をスキップ')
      return 'skipped'
    } catch (error) {
      console.error('URL削除エラー:', error)
      throw error
    }
  }
  console.log('内部操作のため削除をスキップ')
  return 'internal_operation'
}
/**
 * 新しいタブ作成時の処理
 */
const handleTabCreated = async (tab: chrome.tabs.Tab): Promise<void> => {
  console.log('新しいタブが作成されました:', redactUrlForLog(tab.url))

  // ドラッグされた情報が存在するか確認
  if (draggedUrlInfo && !draggedUrlInfo.processed) {
    console.log(
      'ドラッグ情報が存在します:',
      redactUrlForLog(draggedUrlInfo.url),
    )
    console.log('新しいタブのURL:', redactUrlForLog(tab.url))

    const draggedUrlKey = createComparableUrlKey(draggedUrlInfo.url, {
      ignoreHash: true,
    })
    const tabUrlKey = createComparableUrlKey(tab.url ?? '', {
      ignoreHash: true,
    })
    console.log('比較用ドラッグURL:', redactUrlForLog(draggedUrlInfo.url))
    console.log('比較用新タブURL:', redactUrlForLog(tab.url))

    // URLが一致しない場合は何もしない
    if (!tabUrlKey || !draggedUrlKey || tabUrlKey !== draggedUrlKey) {
      console.log('URLが一致しません。削除をスキップします')
      return
    }
    console.log('URLが一致しています')
    try {
      // 処理済みとマーク
      draggedUrlInfo.processed = true
      const settings = await getUserSettings()
      if (!settings.removeTabAfterOpen) {
        console.log('設定により削除をスキップします')
        return
      }
      console.log(
        '設定に基づきURLを削除します:',
        redactUrlForLog(draggedUrlInfo.url),
      )
      await removeUrlFromStorage(draggedUrlInfo.url)
    } catch (error) {
      console.error('タブ作成後の処理でエラー:', error)
    } finally {
      // 処理完了後、ドラッグ情報をクリア
      draggedUrlInfo = null
    }
  }
}

export {
  clearDraggedUrlInfo,
  createComparableUrlKey,
  getDraggedUrlInfo,
  handleTabCreated,
  handleUrlDragStarted,
  handleUrlDropped,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
  setDraggedUrlInfo,
}
