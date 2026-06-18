import { redactUrlForLog } from '@/lib/logging/redact-url'
import { createOrUpdateUrlRecord } from '@/lib/storage/urls'
import type {
  CustomProject,
  ProjectKeywordSettings,
  SubCategoryKeyword,
  TabGroup,
  UrlRecord,
  UserSettings,
} from '@/types/storage'

import type {
  ImportedCustomProjectData,
  ImportedCustomProjectUrlData,
} from './schemas'
import {
  CUSTOM_UNCATEGORIZED_PROJECT_ID,
  getUncategorizedProjectName,
  IMPORT_URL_RECORD_OPTIONS,
  normalizeUrlKey,
} from './url-conversion'

const normalizeStringArray = (items: unknown[] | undefined): string[] => {
  if (!Array.isArray(items)) {
    return []
  }
  const values: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (typeof item !== 'string' || seen.has(item)) {
      continue
    }
    seen.add(item)
    values.push(item)
  }
  return values
}

/**
 * CategoryKeywordsを型安全に正規化する
 */
const normalizeCategoryKeywords = (
  keywords: unknown[] | undefined,
): SubCategoryKeyword[] => {
  if (!Array.isArray(keywords)) {
    return []
  }
  return keywords.reduce<SubCategoryKeyword[]>((items, k) => {
    if (
      typeof k !== 'object' ||
      k === null ||
      !('categoryName' in k) ||
      typeof k.categoryName !== 'string'
    ) {
      return items
    }
    const kKeywords: unknown = 'keywords' in k ? k.keywords : undefined
    items.push({
      categoryName: k.categoryName,
      keywords: Array.isArray(kKeywords)
        ? kKeywords.filter((k): k is string => typeof k === 'string')
        : [],
    })
    return items
  }, [])
}

/**
 * サブカテゴリ配列を文字列配列に正規化する
 */
const normalizeSubCategories = (items: unknown[] | undefined): string[] => {
  if (!Array.isArray(items)) {
    return []
  }
  const names: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    let name: string | null = null
    if (typeof item === 'string') {
      name = item
    } else if (
      typeof item === 'object' &&
      item !== null &&
      'name' in item &&
      typeof item.name === 'string'
    ) {
      ;({ name } = item)
    }
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    names.push(name)
  }
  return names
}

const normalizeSubCategoryOrder = (
  items: unknown[] | undefined,
  validCategories: string[],
): string[] | undefined => {
  const validCategorySet = new Set(validCategories)
  const normalized = normalizeStringArray(items).filter((category) =>
    validCategorySet.has(category),
  )
  return normalized.length > 0 ? normalized : undefined
}

const normalizeSubCategoryOrderWithUncategorized = (
  items: unknown[] | undefined,
  validCategories: string[],
): string[] | undefined => {
  const validCategorySet = new Set(validCategories)
  const normalized = normalizeStringArray(items).filter(
    (category) =>
      category === '__uncategorized' || validCategorySet.has(category),
  )
  return normalized.length > 0 ? normalized : undefined
}

const mergeOrderedSubCategories = ({
  existingOrder,
  importedOrder,
  validCategories,
}: {
  existingOrder: unknown[] | undefined
  importedOrder: unknown[] | undefined
  validCategories: string[]
}): string[] | undefined => {
  const normalizedExisting =
    normalizeSubCategoryOrder(existingOrder, validCategories) ?? []
  const normalizedImported =
    normalizeSubCategoryOrder(importedOrder, validCategories) ?? []
  const mergedOrder = [...normalizedExisting]
  const seen = new Set(normalizedExisting)
  for (const category of normalizedImported) {
    if (seen.has(category)) {
      continue
    }
    seen.add(category)
    mergedOrder.push(category)
  }
  for (const category of validCategories) {
    if (seen.has(category)) {
      continue
    }
    seen.add(category)
    mergedOrder.push(category)
  }
  return mergedOrder.length > 0 ? mergedOrder : undefined
}

const mergeOrderedSubCategoriesWithUncategorized = ({
  existingOrder,
  importedOrder,
  validCategories,
}: {
  existingOrder: unknown[] | undefined
  importedOrder: unknown[] | undefined
  validCategories: string[]
}): string[] | undefined => {
  const normalizedExisting =
    normalizeSubCategoryOrderWithUncategorized(
      existingOrder,
      validCategories,
    ) ?? []
  const normalizedImported =
    normalizeSubCategoryOrderWithUncategorized(
      importedOrder,
      validCategories,
    ) ?? []
  const mergedOrder = [...normalizedExisting]
  const seen = new Set(normalizedExisting)
  for (const category of normalizedImported) {
    if (seen.has(category)) {
      continue
    }
    seen.add(category)
    mergedOrder.push(category)
  }
  for (const category of validCategories) {
    if (seen.has(category)) {
      continue
    }
    seen.add(category)
    mergedOrder.push(category)
  }
  return mergedOrder.length > 0 ? mergedOrder : undefined
}

const normalizeProjectKeywords = (
  projectKeywords: ImportedCustomProjectData['projectKeywords'],
): ProjectKeywordSettings => ({
  domainKeywords: normalizeStringArray(projectKeywords?.domainKeywords),
  titleKeywords: normalizeStringArray(projectKeywords?.titleKeywords),
  urlKeywords: normalizeStringArray(projectKeywords?.urlKeywords),
})

const normalizeImportedCustomProject = (
  project: ImportedCustomProjectData,
): CustomProject => {
  // eslint-disable-next-line typescript/prefer-nullish-coalescing -- 0 (epoch) should fall through to current time
  const createdAt = project.createdAt || Date.now()
  // eslint-disable-next-line typescript/prefer-nullish-coalescing -- 0 (epoch) should fall through
  const updatedAt = project.updatedAt || createdAt
  const urlIds = Array.isArray(project.urlIds)
    ? project.urlIds.filter((id): id is string => typeof id === 'string')
    : []
  const urls = Array.isArray(project.urls)
    ? project.urls.reduce<NonNullable<CustomProject['urls']>>((items, item) => {
        if (item?.url) {
          items.push({
            url: item.url,
            title: item.title ?? '',
            notes: item.notes,
            savedAt: item.savedAt,
            category: item.category,
          })
        }
        return items
      }, [])
    : undefined
  const urlMetadata =
    project.urlMetadata &&
    typeof project.urlMetadata === 'object' &&
    !Array.isArray(project.urlMetadata)
      ? project.urlMetadata
      : undefined
  const categories = normalizeStringArray(project.categories)
  const categoryOrder = normalizeStringArray(project.categoryOrder)

  return {
    id: project.id,
    name: project.name,
    projectKeywords: normalizeProjectKeywords(project.projectKeywords),
    urlIds,
    ...(urls && urls.length > 0 ? { urls } : {}),
    ...(urlMetadata ? { urlMetadata } : {}),
    categories,
    ...(categoryOrder.length > 0 ? { categoryOrder } : {}),
    createdAt,
    updatedAt,
  }
}

const buildCustomProjectUrlIdList = (tabGroups: TabGroup[]): string[] => {
  return [...new Set(tabGroups.flatMap((group) => group.urlIds ?? []))]
}

const stripCustomProjectUrls = (project: CustomProject): CustomProject => {
  const { urls: _urls, ...rest } = project
  return rest
}

const sanitizeCustomProjectMetadata = (
  project: CustomProject,
  urlIds: string[],
): CustomProject['urlMetadata'] | undefined => {
  if (!project.urlMetadata) {
    return undefined
  }
  const allowedIdSet = new Set(urlIds)
  const entries = Object.entries(project.urlMetadata).filter(([urlId]) =>
    allowedIdSet.has(urlId),
  )
  if (entries.length === 0) {
    return undefined
  }
  return Object.fromEntries(entries)
}

const buildSanitizedCustomProject = (
  project: CustomProject,
  urlIds: string[],
): CustomProject => {
  const { urlMetadata: _urlMetadata, ...rest } = stripCustomProjectUrls(project)
  const nextMetadata = sanitizeCustomProjectMetadata(project, urlIds)
  return {
    ...rest,
    urlIds,
    ...(nextMetadata ? { urlMetadata: nextMetadata } : {}),
  }
}

const buildUncategorizedCustomProject = (
  now: number,
  language: UserSettings['language'] | undefined,
  project?: CustomProject,
): CustomProject => {
  if (project) {
    return stripCustomProjectUrls(project)
  }
  return {
    categories: [],
    createdAt: now,
    id: CUSTOM_UNCATEGORIZED_PROJECT_ID,
    name: getUncategorizedProjectName(language),
    projectKeywords: normalizeProjectKeywords(undefined),
    updatedAt: now,
    urlIds: [],
  }
}

const alignCustomProjectsWithSavedTabs = ({
  customProjectOrder,
  customProjects,
  language,
  tabGroups,
}: {
  customProjectOrder: string[] | undefined
  customProjects: CustomProject[]
  language: UserSettings['language'] | undefined
  tabGroups: TabGroup[]
}): {
  customProjectOrder: string[]
  customProjects: CustomProject[]
} => {
  const orderedTabUrlIds = buildCustomProjectUrlIdList(tabGroups)
  const allowedUrlIdSet = new Set(orderedTabUrlIds)
  const normalizedProjects = customProjects.map((project) =>
    stripCustomProjectUrls(normalizeImportedCustomProject(project)),
  )
  const normalizedOrder = normalizeCustomProjectOrder(
    customProjectOrder,
    normalizedProjects,
  )
  const projectById = new Map(
    normalizedProjects.map((project) => [project.id, project]),
  )
  const orderedProjects = normalizedOrder.flatMap((projectId) => {
    const project = projectById.get(projectId)
    return project ? [project] : []
  })
  const normalizedOrderSet = new Set(normalizedOrder)
  const remainingProjects = normalizedProjects.filter(
    (project) => !normalizedOrderSet.has(project.id),
  )
  const allProjects = [...orderedProjects, ...remainingProjects]
  const assignedUrlIds = new Set<string>()
  const sanitizedProjects = allProjects.map((project) => {
    const nextUrlIds: string[] = []
    for (const urlId of project.urlIds ?? []) {
      if (!allowedUrlIdSet.has(urlId) || assignedUrlIds.has(urlId)) {
        continue
      }
      assignedUrlIds.add(urlId)
      nextUrlIds.push(urlId)
    }
    return buildSanitizedCustomProject(project, nextUrlIds)
  })
  const missingUrlIds = orderedTabUrlIds.filter(
    (urlId) => !assignedUrlIds.has(urlId),
  )
  if (missingUrlIds.length > 0) {
    const now = Date.now()
    const uncategorizedIndex = sanitizedProjects.findIndex(
      (project) => project.id === CUSTOM_UNCATEGORIZED_PROJECT_ID,
    )
    const uncategorizedProject = buildUncategorizedCustomProject(
      now,
      language,
      uncategorizedIndex === -1
        ? undefined
        : sanitizedProjects[uncategorizedIndex],
    )
    const uncategorizedUrlIds = uncategorizedProject.urlIds
    const urlIdSet = new Set(uncategorizedUrlIds)
    for (const urlId of missingUrlIds) {
      urlIdSet.add(urlId)
    }
    uncategorizedProject.urlIds = [...urlIdSet]
    const nextUncategorizedProject = buildSanitizedCustomProject(
      uncategorizedProject,
      [...urlIdSet],
    )
    if (uncategorizedIndex === -1) {
      sanitizedProjects.push(nextUncategorizedProject)
    } else {
      sanitizedProjects[uncategorizedIndex] = nextUncategorizedProject
    }
  }
  return {
    customProjectOrder: normalizeCustomProjectOrder(
      customProjectOrder,
      sanitizedProjects,
    ),
    customProjects: sanitizedProjects,
  }
}

// eslint-disable-next-line eslint/complexity
const convertCustomProjectToExportUrls = (
  project: CustomProject,
  urlRecordMap: Map<string, UrlRecord>,
  placeholderUrlRecordMap: Map<string, UrlRecord>,
  placeholderUrlTitle: string,
): NonNullable<CustomProject['urls']> => {
  if (Array.isArray(project.urls) && project.urls.length > 0) {
    return project.urls.filter(
      (item): item is NonNullable<CustomProject['urls']>[number] =>
        Boolean(item?.url),
    )
  }
  if (!Array.isArray(project.urlIds) || project.urlIds.length === 0) {
    return []
  }

  const exportedUrls: NonNullable<CustomProject['urls']> = []
  let offset = 0

  for (const urlId of project.urlIds) {
    const urlRecord =
      // `||` needed: urlRecordMap.get() could return empty string
      // eslint-disable-next-line typescript/prefer-nullish-coalescing
      urlRecordMap.get(urlId) || placeholderUrlRecordMap.get(urlId)
    // `||` needed: urlRecord could be falsey (empty object)
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    const resolvedUrlRecord = urlRecord || {
      id: urlId,
      savedAt:
        typeof project.updatedAt === 'number'
          ? project.updatedAt + offset
          : Date.now() + offset,
      title: placeholderUrlTitle,
      url: `https://tabbin.invalid/#tabbin-export-custom-missing-${project.id}-${urlId}`,
    }
    if (!(urlRecord || placeholderUrlRecordMap.has(urlId))) {
      placeholderUrlRecordMap.set(urlId, resolvedUrlRecord)
    }
    offset += 1
    exportedUrls.push({
      url: resolvedUrlRecord.url,
      title: resolvedUrlRecord.title ?? '',
      notes: project.urlMetadata?.[urlId]?.notes,
      savedAt: resolvedUrlRecord.savedAt,
      category: project.urlMetadata?.[urlId]?.category,
    })
  }

  return exportedUrls
}

const toExportCustomProject = (
  project: CustomProject,
  urlRecordMap: Map<string, UrlRecord>,
  placeholderUrlRecordMap: Map<string, UrlRecord>,
  placeholderUrlTitle: string,
): CustomProject => {
  const exportUrls = convertCustomProjectToExportUrls(
    project,
    urlRecordMap,
    placeholderUrlRecordMap,
    placeholderUrlTitle,
  )

  return {
    id: project.id,
    name: project.name,
    projectKeywords: normalizeProjectKeywords(project.projectKeywords),
    urls: exportUrls,
    categories: [...project.categories],
    ...(project.categoryOrder && project.categoryOrder.length > 0
      ? { categoryOrder: [...project.categoryOrder] }
      : {}),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

const normalizeCustomProjectOrder = (
  order: string[] | undefined,
  projects: CustomProject[],
): string[] => {
  const existingIds = new Set(projects.map((project) => project.id))
  const normalizedOrder = Array.isArray(order)
    ? order.filter((id) => typeof id === 'string' && existingIds.has(id))
    : []
  const normalizedOrderSet = new Set(normalizedOrder)
  const missingIds = projects.reduce<string[]>((ids, project) => {
    if (!normalizedOrderSet.has(project.id)) {
      ids.push(project.id)
    }
    return ids
  }, [])
  return [...normalizedOrder, ...missingIds]
}

const mergeImportedCustomProjects = (
  currentProjects: CustomProject[],
  currentOrder: string[],
  importedProjects: CustomProject[],
  importedOrder: string[] | undefined,
): {
  customProjects: CustomProject[]
  customProjectOrder: string[]
} => {
  const normalizedCurrentProjects = currentProjects.map((project) =>
    normalizeImportedCustomProject(project),
  )
  const normalizedImportedProjects = importedProjects.map((project) =>
    normalizeImportedCustomProject(project),
  )
  const currentIds = new Set(
    normalizedCurrentProjects.map((project) => project.id),
  )
  const newProjects = normalizedImportedProjects.filter(
    (project) => !currentIds.has(project.id),
  )
  const mergedProjects = [...normalizedCurrentProjects, ...newProjects]
  const normalizedCurrentOrder = normalizeCustomProjectOrder(
    currentOrder,
    normalizedCurrentProjects,
  )
  const normalizedImportedOrder = normalizeCustomProjectOrder(
    importedOrder,
    normalizedImportedProjects,
  )
  const newProjectIds = new Set(newProjects.map((project) => project.id))
  const appendedImportedIds = normalizedImportedOrder.filter((id) =>
    newProjectIds.has(id),
  )

  return {
    customProjectOrder: [...normalizedCurrentOrder, ...appendedImportedIds],
    customProjects: mergedProjects,
  }
}

const overwriteImportedCustomProjects = (
  importedProjects: CustomProject[],
  importedOrder: string[] | undefined,
): {
  customProjects: CustomProject[]
  customProjectOrder: string[]
} => {
  const customProjects = importedProjects.map((project) =>
    normalizeImportedCustomProject(project),
  )
  return {
    customProjectOrder: normalizeCustomProjectOrder(
      importedOrder,
      customProjects,
    ),
    customProjects,
  }
}

const restoreImportedCustomProjectUrlsFromIds = (
  project: ImportedCustomProjectData,
  importedUrlRecordMap: Map<string, ImportedCustomProjectUrlData>,
  currentUrlRecordMap: Map<string, UrlRecord>,
): ImportedCustomProjectUrlData[] => {
  if (!Array.isArray(project.urlIds) || project.urlIds.length === 0) {
    return []
  }

  const restoredUrls: ImportedCustomProjectUrlData[] = []
  for (const urlId of project.urlIds) {
    const urlRecord =
      // `||` needed: importedUrlRecordMap.get() could return empty string
      // eslint-disable-next-line typescript/prefer-nullish-coalescing
      importedUrlRecordMap.get(urlId) || currentUrlRecordMap.get(urlId)
    if (!urlRecord) {
      continue
    }
    restoredUrls.push({
      url: urlRecord.url,
      title: urlRecord.title ?? '',
      savedAt: urlRecord.savedAt,
      notes: project.urlMetadata?.[urlId]?.notes,
      category: project.urlMetadata?.[urlId]?.category,
    })
  }
  return restoredUrls
}

const normalizeImportedCustomProjectsForImport = (
  projects: ImportedCustomProjectData[] | undefined,
  importedUrlRecordMap: Map<string, ImportedCustomProjectUrlData>,
  currentUrlRecordMap: Map<string, UrlRecord>,
): (ImportedCustomProjectData & { urls: ImportedCustomProjectUrlData[] })[] => {
  if (!Array.isArray(projects)) {
    return []
  }

  return projects.map((project) => {
    if (Array.isArray(project.urls)) {
      return {
        ...project,
        urls: project.urls.filter(
          (item): item is ImportedCustomProjectUrlData => Boolean(item?.url),
        ),
      }
    }

    return {
      ...project,
      urls: restoreImportedCustomProjectUrlsFromIds(
        project,
        importedUrlRecordMap,
        currentUrlRecordMap,
      ),
    }
  })
}

const convertImportedCustomProjectUrlsToStorage = async (
  urls: ImportedCustomProjectUrlData[],
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<{
  urlIds: string[]
  urlMetadata?: CustomProject['urlMetadata']
}> => {
  const convertedUrls = await Promise.all(
    urls.map(async (urlData) => {
      try {
        const normalizedUrl = normalizeUrlKey(urlData.url)
        const preloadedUrlRecord = urlRecordMapByUrl?.get(normalizedUrl)
        const urlRecord =
          // eslint-disable-next-line typescript/prefer-nullish-coalescing -- preloadedUrlRecord could be null/empty object
          preloadedUrlRecord ||
          (await createOrUpdateUrlRecord(
            urlData.url,
            urlData.title ?? '',
            undefined,
            IMPORT_URL_RECORD_OPTIONS,
          ))
        return {
          id: urlRecord.id,
          metadata:
            urlData.notes || urlData.category
              ? {
                  ...(urlData.notes ? { notes: urlData.notes } : {}),
                  ...(urlData.category ? { category: urlData.category } : {}),
                }
              : undefined,
        }
      } catch (error) {
        console.error(
          `カスタムプロジェクトURL変換エラー: ${redactUrlForLog(urlData.url)}`,
          error,
        )
        return null
      }
    }),
  )
  const urlIds: string[] = []
  const urlMetadata: NonNullable<CustomProject['urlMetadata']> = {}
  for (const convertedUrl of convertedUrls) {
    if (!convertedUrl) {
      continue
    }
    urlIds.push(convertedUrl.id)
    if (convertedUrl.metadata) {
      urlMetadata[convertedUrl.id] = convertedUrl.metadata
    }
  }

  return {
    urlIds,
    urlMetadata: Object.keys(urlMetadata).length > 0 ? urlMetadata : undefined,
  }
}

const resolveImportedCustomProject = async (
  project: ImportedCustomProjectData & {
    urls: ImportedCustomProjectUrlData[]
  },
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<CustomProject> => {
  const categoryOrder = normalizeStringArray(project.categoryOrder)

  if (project.urls.length === 0 && Array.isArray(project.urlIds)) {
    return {
      ...normalizeImportedCustomProject(project),
      ...(categoryOrder.length > 0 ? { categoryOrder } : {}),
    }
  }

  const convertedUrlData = await convertImportedCustomProjectUrlsToStorage(
    project.urls,
    urlRecordMapByUrl,
  )

  return {
    id: project.id,
    name: project.name,
    projectKeywords: normalizeProjectKeywords(project.projectKeywords),
    urlIds: convertedUrlData.urlIds,
    ...(convertedUrlData.urlMetadata
      ? { urlMetadata: convertedUrlData.urlMetadata }
      : {}),
    categories: normalizeStringArray(project.categories),
    ...(categoryOrder.length > 0 ? { categoryOrder } : {}),
    // eslint-disable-next-line typescript/prefer-nullish-coalescing -- 0 (epoch) should fall through
    createdAt: project.createdAt || Date.now(),
    // eslint-disable-next-line typescript/prefer-nullish-coalescing -- 0 (epoch) should fall through; chain
    updatedAt: project.updatedAt || project.createdAt || Date.now(),
  }
}

const resolveImportedCustomProjects = async (
  projects: (ImportedCustomProjectData & {
    urls: ImportedCustomProjectUrlData[]
  })[],
  urlRecordMapByUrl?: Map<string, UrlRecord>,
): Promise<CustomProject[]> =>
  Promise.all(
    projects.map((project) =>
      resolveImportedCustomProject(project, urlRecordMapByUrl),
    ),
  )

export {
  alignCustomProjectsWithSavedTabs,
  buildCustomProjectUrlIdList,
  buildSanitizedCustomProject,
  buildUncategorizedCustomProject,
  convertCustomProjectToExportUrls,
  convertImportedCustomProjectUrlsToStorage,
  mergeImportedCustomProjects,
  mergeOrderedSubCategories,
  mergeOrderedSubCategoriesWithUncategorized,
  normalizeCategoryKeywords,
  normalizeCustomProjectOrder,
  normalizeImportedCustomProject,
  normalizeImportedCustomProjectsForImport,
  normalizeProjectKeywords,
  normalizeStringArray,
  normalizeSubCategories,
  normalizeSubCategoryOrder,
  normalizeSubCategoryOrderWithUncategorized,
  overwriteImportedCustomProjects,
  resolveImportedCustomProject,
  resolveImportedCustomProjects,
  restoreImportedCustomProjectUrlsFromIds,
  sanitizeCustomProjectMetadata,
  stripCustomProjectUrls,
  toExportCustomProject,
}
