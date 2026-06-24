import type { Dispatch, RefObject, SetStateAction } from 'react'

import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { TypedSavedTabsStorageChange } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type {
  ViewMode,
  ModeSyncEvent,
} from '@/contexts/saved-tabs/presentation/types/mode'

interface SyncStorageChangesParams {
  changes: readonly TypedSavedTabsStorageChange[]
  viewModeRef: RefObject<ViewMode>
  refreshTabGroupsWithUrls: (nextGroups?: TabGroup[]) => Promise<TabGroup[]>
  syncDomainDataToCustomProjects: () => Promise<CustomProject[]>
  setSettings: Dispatch<SetStateAction<UserSettingsDto>>
  setCategories: Dispatch<SetStateAction<ParentCategory[]>>
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
}

const findParsedChange = <
  K extends Exclude<TypedSavedTabsStorageChange['key'], 'urls'>,
>(
  changes: readonly TypedSavedTabsStorageChange[],
  key: K,
):
  | Extract<TypedSavedTabsStorageChange, { key: K; kind: 'parsed' }>
  | undefined =>
  changes.find(
    (
      change,
    ): change is Extract<
      TypedSavedTabsStorageChange,
      { key: K; kind: 'parsed' }
    > => change.key === key,
  )

const resolveSyncEvents = (
  changes: readonly TypedSavedTabsStorageChange[],
): ModeSyncEvent[] => {
  const events: ModeSyncEvent[] = []
  if (changes.some((change) => change.key === 'savedTabs')) {
    events.push({
      type: 'savedTabsUpdated',
    })
  }
  if (changes.some((change) => change.key === 'customProjects')) {
    events.push({
      type: 'customProjectsUpdated',
    })
  }
  if (changes.some((change) => change.key === 'customProjectOrder')) {
    events.push({
      type: 'customProjectsUpdated',
    })
  }
  if (changes.some((change) => change.key === 'urls')) {
    events.push({
      type: 'urlsUpdated',
    })
  }
  if (changes.some((change) => change.key === 'userSettings')) {
    events.push({
      type: 'settingsUpdated',
    })
  }
  if (changes.some((change) => change.key === 'parentCategories')) {
    events.push({
      type: 'categoriesUpdated',
    })
  }
  return events
}

const applyUserSettingsChange = (
  changes: readonly TypedSavedTabsStorageChange[],
  setSettings: Dispatch<SetStateAction<UserSettingsDto>>,
): void => {
  const change = findParsedChange(changes, 'userSettings')
  if (!change) {
    return
  }
  if (change.payload.length === 0) {
    return
  }
  const partial = change.payload[0]
  setSettings((prev) => ({
    ...prev,
    ...partial,
  }))
}

const applyCategoryChange = (
  changes: readonly TypedSavedTabsStorageChange[],
  setCategories: Dispatch<SetStateAction<ParentCategory[]>>,
): void => {
  const change = findParsedChange(changes, 'parentCategories')
  if (!change) {
    return
  }
  // port 段階で `safeParseArrayFromStorage` 相当のパースと
  // domain factory 化まで適用済みのため、payload をそのまま反映する。
  setCategories(change.payload)
}

const applyProjectChange = (
  changes: readonly TypedSavedTabsStorageChange[],
  viewModeRef: RefObject<ViewMode>,
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>,
): void => {
  if (viewModeRef.current !== 'custom') {
    return
  }
  const projectsChange = findParsedChange(changes, 'customProjects')
  const orderChange = findParsedChange(changes, 'customProjectOrder')
  if (!projectsChange && !orderChange) {
    return
  }

  // `customProjects` キーが change に含まれていれば、
  // payload が空配列 / 壊れた要素だけだった場合でも空配列として
  // 同期する（旧 `modeSyncService` の挙動を維持するため、port 段階
  // で「配列以外なら空配列」と「壊れた要素をスキップ」が保証される）。
  const nextCustomProjects = projectsChange ? projectsChange.payload : null
  const nextProjectOrder = orderChange ? orderChange.payload : null

  setCustomProjects((prevProjects) => {
    const mergedProjects = nextCustomProjects
      ? mergeProjectReferences(prevProjects, nextCustomProjects)
      : prevProjects
    const orderedProjects =
      nextProjectOrder && nextProjectOrder.length > 0
        ? sortProjectsByOrder(mergedProjects, nextProjectOrder)
        : mergedProjects
    if (areProjectArraysReferenceEqual(prevProjects, orderedProjects)) {
      return prevProjects
    }
    return orderedProjects
  })
}

const areStringArraysEqual = (a?: string[], b?: string[]): boolean => {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) {
    return false
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false
    }
  }
  return true
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isPlainObjectEqual = (
  a?: Record<string, unknown>,
  b?: Record<string, unknown>,
): boolean => {
  const left = a ?? {}
  const right = b ?? {}
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key)) {
      return false
    }
    const leftValue = left[key]
    const rightValue = right[key]
    if (isRecord(leftValue) && isRecord(rightValue)) {
      if (!isPlainObjectEqual(leftValue, rightValue)) {
        return false
      }
      continue
    }
    if (leftValue !== rightValue) {
      return false
    }
  }
  return true
}

const areProjectsEqual = (a: CustomProject, b: CustomProject): boolean =>
  a.id === b.id &&
  a.name === b.name &&
  a.createdAt === b.createdAt &&
  a.updatedAt === b.updatedAt &&
  areStringArraysEqual(a.urlIds, b.urlIds) &&
  areStringArraysEqual(a.categories, b.categories) &&
  areStringArraysEqual(a.categoryOrder, b.categoryOrder) &&
  isPlainObjectEqual(a.urlMetadata, b.urlMetadata) &&
  JSON.stringify(a.urls) === JSON.stringify(b.urls)

const mergeProjectReferences = (
  prevProjects: CustomProject[],
  nextProjects: CustomProject[],
): CustomProject[] => {
  const prevById = new Map(prevProjects.map((project) => [project.id, project]))
  return nextProjects.map((project) => {
    const prevProject = prevById.get(project.id)
    if (prevProject && areProjectsEqual(prevProject, project)) {
      return prevProject
    }
    return project
  })
}

const sortProjectsByOrder = (
  projects: CustomProject[],
  projectOrder: string[],
): CustomProject[] => {
  const orderMap = new Map(projectOrder.map((id, index) => [id, index]))
  return projects.toSorted((a, b) => {
    const indexA = orderMap.get(a.id)
    const indexB = orderMap.get(b.id)
    if (indexA === undefined && indexB === undefined) {
      return 0
    }
    if (indexA === undefined) {
      return 1
    }
    if (indexB === undefined) {
      return -1
    }
    return indexA - indexB
  })
}

const areProjectArraysReferenceEqual = (
  prevProjects: CustomProject[],
  nextProjects: CustomProject[],
): boolean => {
  if (prevProjects.length !== nextProjects.length) {
    return false
  }
  for (let i = 0; i < prevProjects.length; i += 1) {
    if (prevProjects[i] !== nextProjects[i]) {
      return false
    }
  }
  return true
}

const applyTabsAndUrlsChanges = async (
  changes: readonly TypedSavedTabsStorageChange[],
  refreshTabGroupsWithUrls: (nextGroups?: TabGroup[]) => Promise<TabGroup[]>,
  syncDomainDataToCustomProjects: () => Promise<CustomProject[]>,
): Promise<void> => {
  const savedTabsChange = findParsedChange(changes, 'savedTabs')
  const urlsChange = changes.find(
    (change): change is Extract<TypedSavedTabsStorageChange, { key: 'urls' }> =>
      change.key === 'urls',
  )

  if (savedTabsChange) {
    await refreshTabGroupsWithUrls(savedTabsChange.payload)
    await syncDomainDataToCustomProjects()
    return
  }

  if (urlsChange) {
    // 旧 `invalidateUrlCache()` 相当の処理は DDD 移行で不要。
    // `UrlRecordRepository`（chrome impl）は `findAll` 呼び出しごとに
    // `chrome.storage.local.get` を直接実行するため、cache 無効化は
    // 必要ない（`StorageChangePort` 経由の最新値を即時読む）。
    // ここでは `refreshTabGroupsWithUrls()` のみ呼んで urlRecords を
    // 取り直させれば十分（issue #501 / #503）。
    await refreshTabGroupsWithUrls()
  }
}

const syncStorageChanges = async ({
  changes,
  viewModeRef,
  refreshTabGroupsWithUrls,
  syncDomainDataToCustomProjects,
  setSettings,
  setCategories,
  setCustomProjects,
}: SyncStorageChangesParams): Promise<ModeSyncEvent[]> => {
  const events = resolveSyncEvents(changes)

  await applyTabsAndUrlsChanges(
    changes,
    refreshTabGroupsWithUrls,
    syncDomainDataToCustomProjects,
  )
  applyUserSettingsChange(changes, setSettings)
  applyCategoryChange(changes, setCategories)
  applyProjectChange(changes, viewModeRef, setCustomProjects)

  return events
}

export type { SyncStorageChangesParams }
export { syncStorageChanges }
