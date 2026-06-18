import { v4 as uuidv4 } from 'uuid'

import { redactUrlForLog } from '@/lib/logging/redact-url'
import type {
  CustomProject,
  ProjectKeywordSettings,
  TabGroup,
  UrlRecord,
} from '@/types/storage'

import {
  findMatchingProjectIdForSavedTab,
  normalizeProjectKeywords,
} from './project-keywords'
import { migrateToUrlsStorage } from './url-migration'
import {
  createOrUpdateUrlRecord,
  createOrUpdateUrlRecordsBatch,
  getUrlRecords,
  getUrlRecordsByIds,
} from './urls'
import { CustomProjectSchema } from './zod-storage'

const CUSTOM_UNCATEGORIZED_PROJECT_ID = 'custom-uncategorized'
const CUSTOM_UNCATEGORIZED_PROJECT_NAME = '未分類'

let saveUrlsToCustomProjectsQueue: Promise<void> = Promise.resolve()

interface SavedTabItem {
  url: string
  title: string
}

/**
 * CustomProjectからURLデータを取得する（新旧形式対応）
 */
const getProjectUrls = async (
  project: CustomProject,
): Promise<
  (UrlRecord & {
    notes?: string
    category?: string
  })[]
> => {
  // 新形式のみサポート: URLIDsから参照して取得
  if (project.urlIds && project.urlIds.length > 0) {
    // マイグレーションを実行（未実行の場合）
    await migrateToUrlsStorage()
    const urlRecords = await getUrlRecordsByIds(project.urlIds)
    return urlRecords.map((record) => ({
      ...record,
      category: project.urlMetadata?.[record.id]?.category,
      notes: project.urlMetadata?.[record.id]?.notes,
    }))
  }
  return []
} // カスタムプロジェクト一覧を取得する関数
const getCustomProjects = async (): Promise<CustomProject[]> => {
  try {
    // マイグレーションを実行（未実行の場合）
    await migrateToUrlsStorage()

    // プロジェクトとプロジェクト順序を同時に取得
    const data = await chrome.storage.local.get<{
      customProjects?: CustomProject[]
      customProjectOrder?: string[]
    }>(['customProjects', 'customProjectOrder'])
    const customProjects = data.customProjects ?? []
    const projectOrder = data.customProjectOrder ?? []
    console.log(
      `ストレージから取得したカスタムプロジェクト: ${customProjects.length}個`,
    )

    // 不正なプロジェクトデータをフィルタリング
    const validProjects = customProjects.flatMap((project: unknown) => {
      if (
        !(
          project &&
          typeof project === 'object' &&
          project !== null &&
          'id' in project &&
          'name' in project
        )
      ) {
        return []
      }

      const parsed = CustomProjectSchema.safeParse(project)
      if (!parsed.success) {
        // スキーマ違反のレコードは drop し、配列全体は壊さない
        console.warn(
          `不正なプロジェクトデータをスキップ: id=${String((project as { id?: unknown }).id)}`,
          parsed.error.issues,
        )
        return []
      }
      const base = parsed.data
      const validProject = {
        id: base.id,
        name: base.name,
        urlIds: base.urlIds ?? [],
        projectKeywords: normalizeProjectKeywords(base.projectKeywords),
        categories: base.categories ?? [],
        createdAt: base.createdAt ?? Date.now(),
        updatedAt: base.updatedAt ?? Date.now(),
        urls: base.urls,
        urlMetadata: base.urlMetadata,
        categoryOrder: base.categoryOrder,
      } satisfies CustomProject
      Object.assign(project, validProject)
      return [validProject]
    })
    if (validProjects.length !== customProjects.length) {
      console.warn(
        `不正なプロジェクトデータが検出されました: ${customProjects.length - validProjects.length}個を修復`,
      )
      // 修復したデータを自動保存
      await chrome.storage.local.set({
        customProjects: validProjects,
      })
    }

    // 順序が保存されている場合、その順序でソート
    if (projectOrder.length > 0) {
      return validProjects.toSorted((a, b) => {
        const indexA = projectOrder.indexOf(a.id)
        const indexB = projectOrder.indexOf(b.id)
        // 順序にないプロジェクトは最後に
        if (indexA === -1) {
          return 1
        }
        if (indexB === -1) {
          return -1
        }
        return indexA - indexB
      })
    }
    return validProjects
  } catch (error) {
    console.error('カスタムプロジェクト取得エラー:', error)
    return []
  }
} // カスタムプロジェクト一覧を保存する関数
const saveCustomProjects = async (projects: CustomProject[]): Promise<void> => {
  try {
    await chrome.storage.local.set({
      customProjects: projects,
    })
    console.log(`${projects.length}個のカスタムプロジェクトを保存しました`)
  } catch (error) {
    console.error('カスタムプロジェクト保存エラー:', error)
    throw error
  }
} // 新しいカスタムプロジェクトを作成する関数
const createCustomProject = async (name: string): Promise<CustomProject> => {
  const projects = await getCustomProjects()

  // 重複チェック
  if (
    projects.some(
      (project) => project.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error(`DUPLICATE_PROJECT_NAME:${name}`)
  }
  const newProject: CustomProject = {
    id: uuidv4(),
    name,
    projectKeywords: normalizeProjectKeywords(undefined),
    urlIds: [],
    // 新形式のURL IDリスト
    categories: [],
    // 空のカテゴリリストで初期化
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await saveCustomProjects([...projects, newProject])

  // 新規プロジェクトを常に先頭に配置し、既存順序は維持する
  const { customProjectOrder } =
    await chrome.storage.local.get('customProjectOrder')
  const currentIdsInDisplayOrder = projects.map((project) => project.id)
  const normalizedOrder = Array.isArray(customProjectOrder)
    ? customProjectOrder.filter(
        (id): id is string =>
          typeof id === 'string' && currentIdsInDisplayOrder.includes(id),
      )
    : []
  const missingIds = currentIdsInDisplayOrder.filter(
    (id) => !normalizedOrder.includes(id),
  )
  const nextOrder = [newProject.id, ...normalizedOrder, ...missingIds]
  await chrome.storage.local.set({
    customProjectOrder: nextOrder,
  })

  return newProject
}

const appendUncategorizedProjectToOrder = async (): Promise<void> => {
  const { customProjectOrder } =
    await chrome.storage.local.get('customProjectOrder')
  const normalizedOrder = Array.isArray(customProjectOrder)
    ? customProjectOrder
    : []
  if (normalizedOrder.includes(CUSTOM_UNCATEGORIZED_PROJECT_ID)) {
    return
  }
  await chrome.storage.local.set({
    // eslint-disable-next-line typescript/no-unsafe-assignment
    customProjectOrder: [...normalizedOrder, CUSTOM_UNCATEGORIZED_PROJECT_ID],
  })
}

const buildUncategorizedProject = (): CustomProject => ({
  categories: [],
  createdAt: Date.now(),
  id: CUSTOM_UNCATEGORIZED_PROJECT_ID,
  name: CUSTOM_UNCATEGORIZED_PROJECT_NAME,
  projectKeywords: normalizeProjectKeywords(undefined),
  updatedAt: Date.now(),
  urlIds: [],
})

const getOrCreateUncategorizedProject = async (): Promise<CustomProject> => {
  const projects = await getCustomProjects()
  const found = projects.find(
    (project) => project.id === CUSTOM_UNCATEGORIZED_PROJECT_ID,
  )
  if (found) {
    return found
  }
  const uncategorizedProject = buildUncategorizedProject()
  await saveCustomProjects([...projects, uncategorizedProject])
  await appendUncategorizedProjectToOrder()
  return uncategorizedProject
}

const uniqueSavedTabItems = (items: SavedTabItem[]): SavedTabItem[] => {
  const seen = new Set<string>()
  const uniqueItems: SavedTabItem[] = []
  for (const item of items) {
    const trimmedUrl = item.url?.trim()
    if (!trimmedUrl) {
      continue
    }
    if (seen.has(trimmedUrl)) {
      continue
    }
    seen.add(trimmedUrl)
    uniqueItems.push({
      title: item.title || '',
      url: trimmedUrl,
    })
  }
  return uniqueItems
}

const addUrlsToUncategorizedProject = async (
  urls: SavedTabItem[],
): Promise<void> => {
  const normalizedItems = uniqueSavedTabItems(urls)
  if (normalizedItems.length === 0) {
    return
  }

  await migrateToUrlsStorage()
  const projects = await getCustomProjects()
  let targetIndex = projects.findIndex(
    (project) => project.id === CUSTOM_UNCATEGORIZED_PROJECT_ID,
  )
  if (targetIndex === -1) {
    projects.push(buildUncategorizedProject())
    targetIndex = projects.length - 1
    await appendUncategorizedProjectToOrder()
  }

  const targetProject = projects[targetIndex]
  const targetUrlIds = targetProject.urlIds ?? []
  const urlIdSet = new Set(targetUrlIds)
  const now = Date.now()
  const urlRecordByUrl = await createOrUpdateUrlRecordsBatch(
    normalizedItems.map((item) => ({
      title: item.title,
      url: item.url,
    })),
  )

  for (const item of normalizedItems) {
    const urlRecord = urlRecordByUrl.get(item.url)
    if (!urlRecord) {
      throw new Error('URL record was not created for a normalized URL')
    }
    const urlId = urlRecord.id

    removeUrlIdFromOtherProjects(
      projects,
      urlId,
      CUSTOM_UNCATEGORIZED_PROJECT_ID,
      now,
    )

    if (!urlIdSet.has(urlId)) {
      urlIdSet.add(urlId)
      targetUrlIds.push(urlId)
      // eslint-disable-next-line no-await-in-loop -- savedTabs の RMW を直列化する
      await addUrlIdToDomainMode(item.url, urlId)
    }
  }

  targetProject.updatedAt = Date.now()
  projects[targetIndex] = targetProject
  await saveCustomProjects(projects)
}

const getCustomProjectOrder = async (): Promise<string[]> => {
  const { customProjectOrder } =
    await chrome.storage.local.get('customProjectOrder')
  return Array.isArray(customProjectOrder)
    ? customProjectOrder.filter(
        (projectId): projectId is string => typeof projectId === 'string',
      )
    : []
}
const addUrlIdToProject = (project: CustomProject, urlId: string): boolean => {
  project.urlIds ??= []
  const urlIds = project.urlIds
  if (urlIds.includes(urlId)) {
    return false
  }
  urlIds.push(urlId)
  return true
}

const removeUrlIdFromProject = (
  project: CustomProject,
  urlId: string,
  updatedAt: number,
): boolean => {
  if (!project.urlIds?.includes(urlId)) {
    return false
  }

  project.urlIds = project.urlIds.filter((id) => id !== urlId)
  if (project.urlMetadata?.[urlId]) {
    // eslint-disable-next-line typescript/no-dynamic-delete
    delete project.urlMetadata[urlId]
  }
  project.updatedAt = updatedAt
  return true
}

const removeUrlIdFromOtherProjects = (
  projects: CustomProject[],
  urlId: string,
  keepProjectId: string,
  updatedAt = Date.now(),
): boolean => {
  let hasChanges = false
  for (const project of projects) {
    if (project.id === keepProjectId) {
      continue
    }

    if (removeUrlIdFromProject(project, urlId, updatedAt)) {
      hasChanges = true
    }
  }

  return hasChanges
}

const setProjectUrlMetadata = (
  project: CustomProject,
  urlId: string,
  notes?: string,
  category?: string,
): void => {
  if (!(notes || category)) {
    return
  }
  project.urlMetadata ??= {}
  project.urlMetadata[urlId] = {
    category,
    notes,
  }
}
const getDomainFromUrl = (url: string): string => {
  const urlObj = new URL(url)
  return `${urlObj.protocol}//${urlObj.hostname}`
}
const ensureUrlIdInGroup = (group: TabGroup, urlId: string): TabGroup => {
  group.urlIds ??= []
  if (!group.urlIds.includes(urlId)) {
    group.urlIds.push(urlId)
  }
  return group
}
// `addUrlIdToDomainMode` の `chrome.storage.local` read-modify-write を
// 直列化するためのインメモリキュー（issue #548）。同一プロセス内で複数
// の保存経路が並行に走った場合でも、`savedTabs` の競合で urlId が
// 落ちないようにする。エラーはキューに伝播させない（後続の保存を止めない
// ため）。`saveUrlsToCustomProjects` 側でも直列化しているが、ここでも
// 保険をかけて二重に防御する。
let addUrlIdToDomainModeQueue: Promise<void> = Promise.resolve()
const addUrlIdToDomainMode = async (
  url: string,
  urlId: string,
): Promise<void> => {
  const next = addUrlIdToDomainModeQueue.then(async () => {
    const { savedTabs = [] } = await chrome.storage.local.get<{
      savedTabs?: TabGroup[]
    }>('savedTabs')
    const domain = getDomainFromUrl(url)
    const domainGroup = savedTabs.find(
      (group: TabGroup) => group.domain === domain,
    )
    if (domainGroup) {
      ensureUrlIdInGroup(domainGroup, urlId)
    } else {
      savedTabs.push({
        domain,
        id: uuidv4(),
        savedAt: Date.now(),
        urlIds: [urlId],
      })
    }
    await chrome.storage.local.set({
      savedTabs,
    })
    console.log(
      `URL ${redactUrlForLog(url)} をドメインモードのデータにも追加しました`,
    )
  })
  addUrlIdToDomainModeQueue = next.catch(() => {
    // 後続の保存を止めないよう、エラーは握りつぶしてキューに伝播させない
  })
  return next
} // URLをカスタムプロジェクトに追加する関数（新形式対応）
const addUrlToCustomProject = async (
  projectId: string,
  url: string,
  title: string,
  options?: {
    notes?: string
    category?: string
  },
): Promise<void> => {
  try {
    // マイグレーションを実行（未実行の場合）
    await migrateToUrlsStorage()
    const projects = await getCustomProjects()
    const projectIndex = projects.findIndex((p) => p.id === projectId)
    if (projectIndex === -1) {
      throw new Error(`Project with ID ${projectId} not found`)
    }
    const project = projects[projectIndex]

    // URLレコードを作成または更新
    const urlRecord = await createOrUpdateUrlRecord(url, title)
    removeUrlIdFromOtherProjects(projects, urlRecord.id, projectId)
    const isNewUrl = addUrlIdToProject(project, urlRecord.id)
    setProjectUrlMetadata(
      project,
      urlRecord.id,
      options?.notes,
      options?.category,
    )
    if (isNewUrl) {
      await addUrlIdToDomainMode(url, urlRecord.id)
    }
    project.updatedAt = Date.now()
    projects[projectIndex] = project
    await saveCustomProjects(projects)
    console.log(
      `${isNewUrl ? '新しい' : '既存の'}URLをプロジェクトに${isNewUrl ? '追加' : '更新'}しました: ${redactUrlForLog(url)}`,
    )
  } catch (error) {
    console.error('URLをプロジェクトに追加中にエラーが発生しました:', error)
    throw error
  }
} // URLをカスタムプロジェクトから削除する関数（新形式対応）

const saveUrlsToCustomProjectsUnsafe = async (
  urls: SavedTabItem[],
): Promise<void> => {
  const normalizedItems = uniqueSavedTabItems(urls)
  if (normalizedItems.length === 0) {
    return
  }

  const [projects, projectOrder] = await Promise.all([
    getCustomProjects(),
    getCustomProjectOrder(),
  ])
  const matchingProjects = projects.filter(
    (project) => project.id !== CUSTOM_UNCATEGORIZED_PROJECT_ID,
  )
  const uncategorizedItems: SavedTabItem[] = []

  const matchedItems = normalizedItems.reduce<
    { item: SavedTabItem; projectId: string }[]
  >((items, item) => {
    const projectId = findMatchingProjectIdForSavedTab({
      projectOrder,
      projects: matchingProjects,
      savedTab: item,
    })

    if (!projectId) {
      uncategorizedItems.push(item)
      return items
    }

    items.push({ item, projectId })
    return items
  }, [])

  // 直列実行にすることで `addUrlIdToDomainMode` / `saveCustomProjects` /
  // `createOrUpdateUrlRecord` 内の `chrome.storage.local` read-modify-write
  // 競合を防ぐ（issue #548）。同一ドメインの複数 URL をまとめて保存した
  // 場合に最後の 1 件しか残らない現象の主因となっていた。
  for (const { item, projectId } of matchedItems) {
    // eslint-disable-next-line no-await-in-loop -- storage RMW の直列実行が必須
    await addUrlToCustomProject(projectId, item.url, item.title)
  }

  await addUrlsToUncategorizedProject(uncategorizedItems)
}

const saveUrlsToCustomProjects = (urls: SavedTabItem[]): Promise<void> => {
  const savePromise = saveUrlsToCustomProjectsQueue.then(() =>
    saveUrlsToCustomProjectsUnsafe(urls),
  )
  saveUrlsToCustomProjectsQueue = savePromise.catch(() => {
    // 失敗した保存が後続の保存を止めないようにキューだけ回復させる。
  })
  return savePromise
}
const removeUrlFromCustomProject = async (
  projectId: string,
  url: string,
): Promise<void> => {
  // マイグレーションを実行（未実行の場合）
  await migrateToUrlsStorage()
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  const project = projects[projectIndex]

  // 新形式のみサポート: URLIDsからURLを削除
  if (project.urlIds && project.urlIds.length > 0) {
    const urlRecords = await getUrlRecordsByIds(project.urlIds)
    const urlRecord = urlRecords.find((record) => record.url === url)
    if (urlRecord) {
      project.urlIds = project.urlIds.filter((id) => id !== urlRecord.id)

      // メタデータも削除
      if (project.urlMetadata?.[urlRecord.id]) {
        // eslint-disable-next-line typescript/no-dynamic-delete
        delete project.urlMetadata[urlRecord.id]
      }
    }
  }
  project.updatedAt = Date.now()
  projects[projectIndex] = project
  await saveCustomProjects(projects)

  // ドメインモードからも同じURLを削除
  try {
    const { savedTabs = [] } = await chrome.storage.local.get<{
      savedTabs?: TabGroup[]
    }>('savedTabs')

    // URLレコードを取得
    const urlRecords = await getUrlRecordsByIds(
      savedTabs.flatMap((group: TabGroup) => group.urlIds ?? []),
    )
    const urlRecord = urlRecords.find((record) => record.url === url)
    if (urlRecord) {
      const updatedGroups = savedTabs.reduce<TabGroup[]>((groups, group) => {
        if (!group.urlIds) {
          groups.push(group)
          return groups
        }

        const updatedUrlIds = group.urlIds.filter((id) => id !== urlRecord.id)
        if (updatedUrlIds.length > 0) {
          groups.push({
            ...group,
            urlIds: updatedUrlIds,
          })
        }
        return groups
      }, [])
      await chrome.storage.local.set({
        savedTabs: updatedGroups,
      })
      console.log(
        `URL ${redactUrlForLog(url)} はドメインモードからも削除されました`,
      )
    }
  } catch (syncError) {
    console.error('ドメインモードの同期中にエラーが発生しました:', syncError)
    // エラーをスローしないで続行 - カスタムプロジェクトの削除は成功している
  }
}

/**
 * ドメインモードからも指定されたURLを同期削除するヘルパー関数
 */
const syncDeleteToDomainMode = async (
  targetUrlsSet: Set<string>,
  urlsLength: number,
): Promise<void> => {
  try {
    const { savedTabs = [] } = await chrome.storage.local.get<{
      savedTabs?: TabGroup[]
    }>('savedTabs')

    const urlRecords = await getUrlRecordsByIds(
      savedTabs.flatMap((g: TabGroup) => g.urlIds ?? []),
    )
    const recordsToDelete = urlRecords.filter((record) =>
      targetUrlsSet.has(record.url),
    )

    if (recordsToDelete.length > 0) {
      const idsToDelete = new Set(recordsToDelete.map((r) => r.id))
      const updatedGroups = savedTabs.reduce<TabGroup[]>((groups, group) => {
        if (!group.urlIds) {
          groups.push(group)
          return groups
        }

        const updatedUrlIds = group.urlIds.filter((id) => !idsToDelete.has(id))
        if (updatedUrlIds.length > 0) {
          groups.push({
            ...group,
            urlIds: updatedUrlIds,
          })
        }
        return groups
      }, [])

      await chrome.storage.local.set({
        savedTabs: updatedGroups,
      })
      console.log(`${urlsLength}件のURLはドメインモードからも削除されました`)
    }
  } catch (syncError) {
    console.error('ドメインモードの同期中にエラーが発生しました:', syncError)
  }
}

/**
 * プロジェクトのURL IDsとメタデータから指定IDを削除する内部関数
 * @returns 変更があったかどうか
 */
const updateProjectUrlIdsAndMetadata = (
  project: CustomProject,
  idsToDelete: Set<string>,
): boolean => {
  if (!project.urlIds || project.urlIds.length === 0) {
    return false
  }

  const hasOverlap = project.urlIds.some((id) => idsToDelete.has(id))
  if (hasOverlap) {
    project.urlIds = project.urlIds.filter((id) => !idsToDelete.has(id))

    if (project.urlMetadata) {
      for (const id of idsToDelete) {
        if (project.urlMetadata[id]) {
          // eslint-disable-next-line typescript/no-dynamic-delete
          delete project.urlMetadata[id]
        }
      }
    }
    project.updatedAt = Date.now()
    return true
  }
  return false
}

/**
 * 特定のプロジェクトから複数の URL をまとめて削除する。
 */
const removeUrlsFromCustomProject = async (
  projectId: string,
  urls: string[],
): Promise<void> => {
  if (urls.length === 0) {
    return
  }

  // マイグレーションを実行（未実行の場合）
  await migrateToUrlsStorage()
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }

  const project = projects[projectIndex]
  const targetUrlsSet = new Set(urls)

  if (project.urlIds && project.urlIds.length > 0) {
    const urlRecords = await getUrlRecordsByIds(project.urlIds)
    const recordsToDelete = urlRecords.filter((record) =>
      targetUrlsSet.has(record.url),
    )

    if (recordsToDelete.length > 0) {
      const idsToDelete = new Set(recordsToDelete.map((r) => r.id))

      updateProjectUrlIdsAndMetadata(project, idsToDelete)
      projects[projectIndex] = project
      await saveCustomProjects(projects)
    }
  }

  // ドメインモードからも同じURLを削除
  await syncDeleteToDomainMode(targetUrlsSet, urls.length)
}

interface DeleteSyncBehavior {
  throwOnError?: boolean
}

/**
 * URLをすべてのカスタムプロジェクトから削除する関数
 */
const removeUrlFromAllCustomProjects = async (
  url: string,
  options: DeleteSyncBehavior = {},
): Promise<void> => {
  try {
    await migrateToUrlsStorage()
    const projects = await getCustomProjects()
    let hasChanges = false

    const urlRecords = await getUrlRecords()
    const urlRecord = urlRecords.find((record) => record.url === url)
    if (!urlRecord) {
      return
    }

    for (const project of projects) {
      if (removeUrlIdFromProject(project, urlRecord.id, Date.now())) {
        hasChanges = true
      }
    }

    if (hasChanges) {
      await saveCustomProjects(projects)
      console.log(
        `URL ${redactUrlForLog(url)} をすべてのカスタムプロジェクトから削除しました`,
      )
    }
  } catch (error) {
    console.error(
      'カスタムプロジェクトからのURL削除中にエラーが発生しました:',
      error,
    )
    if (options.throwOnError) {
      throw error
    }
  }
}

/**
 * 複数のプロジェクトから指定のIDを一括で削除する内部処理
 */
const processProjectsForBulkDelete = (
  projects: CustomProject[],
  idsToDelete: Set<string>,
): boolean => {
  let hasChanges = false
  for (const project of projects) {
    if (updateProjectUrlIdsAndMetadata(project, idsToDelete)) {
      hasChanges = true
    }
  }
  return hasChanges
}

/**
 * 全てのプロジェクトから複数の URL をまとめて削除する。
 */
const removeUrlsFromAllCustomProjects = async (
  urls: string[],
  options: DeleteSyncBehavior = {},
): Promise<void> => {
  if (urls.length === 0) {
    return
  }

  try {
    await migrateToUrlsStorage()
    const projects = await getCustomProjects()
    const targetUrlsSet = new Set(urls)

    const urlRecords = await getUrlRecords()
    const recordsToDelete = urlRecords.filter((record) =>
      targetUrlsSet.has(record.url),
    )

    if (recordsToDelete.length === 0) {
      return
    }

    const idsToDelete = new Set(recordsToDelete.map((r) => r.id))
    const hasChanges = processProjectsForBulkDelete(projects, idsToDelete)

    if (hasChanges) {
      await saveCustomProjects(projects)
      console.log(
        `${urls.length}件のURLをすべてのカスタムプロジェクトから削除しました`,
      )
    }
  } catch (error) {
    console.error(
      'カスタムプロジェクトからの複数URL削除中にエラーが発生しました:',
      error,
    )
    if (options.throwOnError) {
      throw error
    }
  }
} // カスタムプロジェクトを削除する関数

/**
 * 全てのプロジェクトから複数の URL ID をまとめて削除する。
 */
const removeUrlIdsFromAllCustomProjects = async (
  urlIds: string[],
  options: DeleteSyncBehavior = {},
): Promise<void> => {
  if (urlIds.length === 0) {
    return
  }

  try {
    await migrateToUrlsStorage()
    const projects = await getCustomProjects()
    const idsToDelete = new Set(urlIds)
    const hasChanges = processProjectsForBulkDelete(projects, idsToDelete)

    if (hasChanges) {
      await saveCustomProjects(projects)
      console.log(
        `${urlIds.length}件のURL IDをすべてのカスタムプロジェクトから削除しました`,
      )
    }
  } catch (error) {
    console.error(
      'カスタムプロジェクトからの複数URL ID削除中にエラーが発生しました:',
      error,
    )
    if (options.throwOnError) {
      throw error
    }
  }
} // カスタムプロジェクトを削除する関数

const ensureProjectMetadataEntry = (
  project: CustomProject,
  urlId: string,
): void => {
  project.urlMetadata ??= {}
  project.urlMetadata[urlId] ??= {}
}

const mergeUrlsIntoUncategorized = (
  projectToDelete: CustomProject,
  uncategorizedProject: CustomProject,
): void => {
  if (!(projectToDelete.urlIds && projectToDelete.urlIds.length > 0)) {
    return
  }
  uncategorizedProject.urlIds ??= []
  const uncategorizedUrlIds = uncategorizedProject.urlIds
  const targetUrlSet = new Set(uncategorizedUrlIds)
  for (const urlId of projectToDelete.urlIds) {
    if (targetUrlSet.has(urlId)) {
      continue
    }
    targetUrlSet.add(urlId)
    uncategorizedUrlIds.push(urlId)
    const metadata = projectToDelete.urlMetadata?.[urlId]
    if (!metadata?.notes) {
      continue
    }
    ensureProjectMetadataEntry(uncategorizedProject, urlId)
    if (uncategorizedProject.urlMetadata) {
      uncategorizedProject.urlMetadata[urlId].notes = metadata.notes
    }
  }
  uncategorizedProject.updatedAt = Date.now()
}

const findOrCreateUncategorizedProject = async (
  projects: CustomProject[],
): Promise<CustomProject> => {
  const existing = projects.find(
    (project) => project.id === CUSTOM_UNCATEGORIZED_PROJECT_ID,
  )
  if (existing) {
    return existing
  }
  const created = buildUncategorizedProject()
  projects.push(created)
  await appendUncategorizedProjectToOrder()
  return created
}

const removeProjectIdFromOrder = async (projectId: string): Promise<void> => {
  const { customProjectOrder } =
    await chrome.storage.local.get('customProjectOrder')
  const normalizedOrder = Array.isArray(customProjectOrder)
    ? customProjectOrder
    : []
  await chrome.storage.local.set({
    customProjectOrder: normalizedOrder.filter((id) => id !== projectId),
  })
}

const deleteCustomProject = async (projectId: string): Promise<void> => {
  if (projectId === CUSTOM_UNCATEGORIZED_PROJECT_ID) {
    throw new Error('Uncategorized project cannot be deleted')
  }
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }

  const projectToDelete = projects[projectIndex]
  const remainingProjects = projects.filter(
    (project) => project.id !== projectId,
  )

  const uncategorizedProject =
    await findOrCreateUncategorizedProject(remainingProjects)
  mergeUrlsIntoUncategorized(projectToDelete, uncategorizedProject)
  await saveCustomProjects(remainingProjects)
  await removeProjectIdFromOrder(projectId)
} // カスタムプロジェクト名を更新する関数
const updateCustomProjectName = async (
  projectId: string,
  newName: string,
): Promise<void> => {
  const projects = await getCustomProjects()

  // 同名プロジェクトの重複チェック（自分自身は除く）
  if (
    projects.some(
      (p) =>
        p.name.toLowerCase() === newName.toLowerCase() && p.id !== projectId,
    )
  ) {
    throw new Error(`DUPLICATE_PROJECT_NAME:${newName}`)
  }
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  projects[projectIndex] = {
    ...projects[projectIndex],
    name: newName,
    updatedAt: Date.now(),
  }
  await saveCustomProjects(projects)
} // プロジェクトにカテゴリを追加する関数
const addCategoryToProject = async (
  projectId: string,
  categoryName: string,
): Promise<void> => {
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  const project = projects[projectIndex]

  // カテゴリが既に存在するかチェック
  if (project.categories.includes(categoryName)) {
    return // 既に存在する場合は何もしない
  }

  // カテゴリを追加
  project.categories = [...project.categories, categoryName]
  project.updatedAt = Date.now()

  // カテゴリ順序が存在しなければ初期化
  if (project.categoryOrder) {
    // 新しいカテゴリを順序にも追加
    project.categoryOrder = [...project.categoryOrder, categoryName]
  } else {
    project.categoryOrder = project.categories
  }
  projects[projectIndex] = project
  await saveCustomProjects(projects)
} // プロジェクトからカテゴリを削除する関数
const removeCategoryFromProject = async (
  projectId: string,
  categoryName: string,
): Promise<void> => {
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  const project = projects[projectIndex]

  // カテゴリを削除
  project.categories = project.categories.filter((cat) => cat !== categoryName)

  // カテゴリ順序も更新
  if (project.categoryOrder) {
    project.categoryOrder = project.categoryOrder.filter(
      (cat) => cat !== categoryName,
    )
  }

  // このカテゴリに所属するURLのカテゴリをnullに設定（新形式対応）
  if (project.urlMetadata) {
    for (const [urlId, meta] of Object.entries(project.urlMetadata)) {
      if (meta?.category === categoryName) {
        project.urlMetadata[urlId].category = undefined
      }
    }
  }
  project.updatedAt = Date.now()
  projects[projectIndex] = project
  await saveCustomProjects(projects)
} // URLにカテゴリを設定する関数（新形式対応）
const setUrlCategory = async (
  projectId: string,
  url: string,
  category?: string,
): Promise<void> => {
  // マイグレーションを実行（未実行の場合）
  await migrateToUrlsStorage()
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  const project = projects[projectIndex]

  // 新形式のみサポート: URLIDsからURLレコードを探してカテゴリを設定
  if (project.urlIds && project.urlIds.length > 0) {
    const urlRecords = await getUrlRecordsByIds(project.urlIds)
    const urlRecord = urlRecords.find((record) => record.url === url)
    if (urlRecord) {
      project.urlMetadata ??= {}
      if (!project.urlMetadata[urlRecord.id]) {
        project.urlMetadata[urlRecord.id] = {}
      }
      project.urlMetadata[urlRecord.id].category = category
    }
  }
  project.updatedAt = Date.now()
  projects[projectIndex] = project
  await saveCustomProjects(projects)
} // カテゴリ順序を更新する関数
const updateCategoryOrder = async (
  projectId: string,
  newOrder: string[],
): Promise<void> => {
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  const project = projects[projectIndex]
  project.categoryOrder = newOrder
  project.updatedAt = Date.now()
  projects[projectIndex] = project
  await saveCustomProjects(projects)
} // プロジェクト内のURLを並び替える関数
const reorderProjectUrls = async (
  projectId: string,
  urls: CustomProject['urls'],
): Promise<void> => {
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  const project = projects[projectIndex]

  if (project.urlIds && project.urlIds.length > 0 && urls) {
    const urlRecords = await getUrlRecordsByIds(project.urlIds)
    const urlToIds = new Map<string, string[]>()
    for (const record of urlRecords) {
      const ids = urlToIds.get(record.url)
      if (ids) {
        ids.push(record.id)
      } else {
        urlToIds.set(record.url, [record.id])
      }
    }

    const orderedIds: string[] = []
    for (const item of urls) {
      const idQueue = urlToIds.get(item.url)
      const nextId = idQueue?.shift()
      if (nextId) {
        orderedIds.push(nextId)
      }
    }

    if (orderedIds.length > 0) {
      const orderedSet = new Set(orderedIds)
      const remainingIds = project.urlIds.filter((id) => !orderedSet.has(id))
      project.urlIds = [...orderedIds, ...remainingIds]
    }
  }

  project.urls = urls
  project.updatedAt = Date.now()
  projects[projectIndex] = project
  await saveCustomProjects(projects)
} // プロジェクト順序を保存する関数
// eslint-disable-next-line eslint/complexity
const moveUrlBetweenCustomProjects = async (
  sourceProjectId: string,
  targetProjectId: string,
  url: string,
): Promise<void> => {
  if (sourceProjectId === targetProjectId) {
    return
  }

  await migrateToUrlsStorage()
  const projects = await getCustomProjects()
  const sourceIndex = projects.findIndex(
    (project) => project.id === sourceProjectId,
  )
  const targetIndex = projects.findIndex(
    (project) => project.id === targetProjectId,
  )
  if (sourceIndex === -1 || targetIndex === -1) {
    throw new Error('Source or target project not found')
  }

  const sourceProject = projects[sourceIndex]
  const targetProject = projects[targetIndex]
  if (!(sourceProject.urlIds && sourceProject.urlIds.length > 0)) {
    throw new Error('URL not found in source project')
  }

  const sourceRecords = await getUrlRecordsByIds(sourceProject.urlIds)
  const urlRecord = sourceRecords.find((record) => record.url === url)
  if (!urlRecord) {
    throw new Error('URL not found in source project')
  }

  const urlId = urlRecord.id
  targetProject.urlIds ??= []
  const targetUrlIds = targetProject.urlIds
  if (targetUrlIds.includes(urlId)) {
    throw new Error('URL already exists in target project')
  }

  sourceProject.urlIds = sourceProject.urlIds.filter((id) => id !== urlId)
  targetUrlIds.push(urlId)

  const sourceMetadata = sourceProject.urlMetadata?.[urlId]
  if (sourceProject.urlMetadata?.[urlId]) {
    // eslint-disable-next-line typescript/no-dynamic-delete
    delete sourceProject.urlMetadata[urlId]
  }
  if (sourceMetadata?.notes) {
    targetProject.urlMetadata ??= {}
    targetProject.urlMetadata[urlId] = {
      notes: sourceMetadata.notes,
    }
  }

  sourceProject.updatedAt = Date.now()
  targetProject.updatedAt = Date.now()
  projects[sourceIndex] = sourceProject
  projects[targetIndex] = targetProject
  await saveCustomProjects(projects)
}

const updateProjectOrder = async (projectIds: string[]): Promise<void> => {
  try {
    // プロジェクト順序の保存
    await chrome.storage.local.set({
      customProjectOrder: projectIds,
    })
    console.log('プロジェクト順序を保存しました:', projectIds)
  } catch (error) {
    console.error('プロジェクト順序の保存に失敗しました:', error)
    throw error
  }
} // カテゴリ名を変更する関数
const renameCategoryInProject = async (
  projectId: string,
  oldCategoryName: string,
  newCategoryName: string,
): Promise<void> => {
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }
  const project = projects[projectIndex]
  if (project.categories.includes(newCategoryName)) {
    throw new Error(
      `Category name ${newCategoryName} already exists in project ${projectId}`,
    )
  }
  project.categories = project.categories.map((cat) =>
    cat === oldCategoryName ? newCategoryName : cat,
  )
  if (project.categoryOrder) {
    project.categoryOrder = project.categoryOrder.map((cat) =>
      cat === oldCategoryName ? newCategoryName : cat,
    )
  }
  // URLメタデータのカテゴリ名を更新（新形式対応）
  if (project.urlMetadata) {
    for (const [urlId, meta] of Object.entries(project.urlMetadata)) {
      if (meta?.category === oldCategoryName) {
        project.urlMetadata[urlId].category = newCategoryName
      }
    }
  }
  project.updatedAt = Date.now()
  projects[projectIndex] = project
  await saveCustomProjects(projects)
}

const updateProjectKeywords = async (
  projectId: string,
  projectKeywords: ProjectKeywordSettings,
): Promise<void> => {
  const projects = await getCustomProjects()
  const projectIndex = projects.findIndex((p) => p.id === projectId)
  if (projectIndex === -1) {
    throw new Error(`Project with ID ${projectId} not found`)
  }

  const project = projects[projectIndex]
  project.projectKeywords = normalizeProjectKeywords(projectKeywords)
  project.updatedAt = Date.now()
  projects[projectIndex] = project
  await saveCustomProjects(projects)
}

export {
  CUSTOM_UNCATEGORIZED_PROJECT_ID,
  CUSTOM_UNCATEGORIZED_PROJECT_NAME,
  addCategoryToProject,
  addUrlIdToProject,
  addUrlToCustomProject,
  addUrlsToUncategorizedProject,
  createCustomProject,
  deleteCustomProject,
  ensureProjectMetadataEntry,
  getCustomProjectOrder,
  getCustomProjects,
  getOrCreateUncategorizedProject,
  getProjectUrls,
  mergeUrlsIntoUncategorized,
  moveUrlBetweenCustomProjects,
  removeCategoryFromProject,
  removeProjectIdFromOrder,
  removeUrlFromAllCustomProjects,
  removeUrlFromCustomProject,
  removeUrlIdFromProject,
  removeUrlIdFromOtherProjects,
  removeUrlIdsFromAllCustomProjects,
  removeUrlsFromAllCustomProjects,
  removeUrlsFromCustomProject,
  renameCategoryInProject,
  reorderProjectUrls,
  saveCustomProjects,
  saveUrlsToCustomProjects,
  setProjectUrlMetadata,
  setUrlCategory,
  updateProjectUrlIdsAndMetadata,
  updateCategoryOrder,
  updateCustomProjectName,
  updateProjectKeywords,
  updateProjectOrder,
}
