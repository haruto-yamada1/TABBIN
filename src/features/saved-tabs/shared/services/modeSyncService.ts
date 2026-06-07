import type { Dispatch, RefObject, SetStateAction } from 'react'
import { z } from 'zod'

import {
  CustomProjectSchema,
  fromStorageChange,
  ParentCategorySchema,
  TabGroupSchema,
  UserSettingsSchema,
} from '@/lib/storage/zod-storage'
import { invalidateUrlCache } from '@/lib/storage/urls'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UserSettings,
  ViewMode,
} from '@/types/storage'

import type { ModeSyncEvent } from '../types/mode'

interface SyncStorageChangesParams {
  changes: Record<string, chrome.storage.StorageChange>
  viewModeRef: RefObject<ViewMode>
  refreshTabGroupsWithUrls: (nextGroups?: TabGroup[]) => Promise<TabGroup[]>
  syncDomainDataToCustomProjects: () => Promise<CustomProject[]>
  setSettings: Dispatch<SetStateAction<UserSettings>>
  setCategories: Dispatch<SetStateAction<ParentCategory[]>>
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
}

const resolveSyncEvents = (
  changes: Record<string, chrome.storage.StorageChange>,
): ModeSyncEvent[] => {
  const events: ModeSyncEvent[] = []
  if (changes.savedTabs) {
    events.push({
      type: 'savedTabsUpdated',
    })
  }
  if (changes.customProjects) {
    events.push({
      type: 'customProjectsUpdated',
    })
  }
  if (changes.customProjectOrder) {
    events.push({
      type: 'customProjectsUpdated',
    })
  }
  if (changes.urls) {
    events.push({
      type: 'urlsUpdated',
    })
  }
  if (changes.userSettings) {
    events.push({
      type: 'settingsUpdated',
    })
  }
  if (changes.parentCategories) {
    events.push({
      type: 'categoriesUpdated',
    })
  }
  return events
}

const applyUserSettingsChange = (
  changes: Record<string, chrome.storage.StorageChange>,
  setSettings: Dispatch<SetStateAction<UserSettings>>,
): void => {
  if (!changes.userSettings) {
    return
  }
  const result = UserSettingsSchema.partial().safeParse(
    changes.userSettings.newValue,
  )
  if (!result.success) {
    return
  }
  setSettings((prev) => ({
    ...prev,
    ...result.data,
  }))
}

const applyCategoryChange = (
  changes: Record<string, chrome.storage.StorageChange>,
  setCategories: Dispatch<SetStateAction<ParentCategory[]>>,
): void => {
  if (!changes.parentCategories) {
    return
  }
  const nextCategories = Array.isArray(changes.parentCategories.newValue)
    ? fromStorageChange(
        z.array(ParentCategorySchema),
        changes.parentCategories.newValue,
      )
    : []
  setCategories(nextCategories)
}

const toCustomProject = (
  p: z.output<typeof CustomProjectSchema>,
): CustomProject => ({
  ...p,
  categories: p.categories ?? [],
  createdAt: p.createdAt ?? 0,
  updatedAt: p.updatedAt ?? 0,
})

const applyProjectChange = (
  changes: Record<string, chrome.storage.StorageChange>,
  viewModeRef: RefObject<ViewMode>,
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>,
): void => {
  if (viewModeRef.current !== 'custom') {
    return
  }
  const hasProjectsChange = Boolean(changes.customProjects)
  const hasOrderChange = Boolean(changes.customProjectOrder)
  if (!(hasProjectsChange || hasOrderChange)) {
    return
  }

  let nextCustomProjects: CustomProject[] | null = null
  if (hasProjectsChange) {
    nextCustomProjects = Array.isArray(changes.customProjects?.newValue)
      ? fromStorageChange(
          z.array(CustomProjectSchema),
          changes.customProjects.newValue,
        ).map(toCustomProject)
      : []
  }
  const nextProjectOrder =
    hasOrderChange && Array.isArray(changes.customProjectOrder?.newValue)
      ? fromStorageChange(
          z.array(z.string()),
          changes.customProjectOrder.newValue,
        )
      : null

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
    if (indexA == null && indexB == null) {
      return 0
    }
    if (indexA == null) {
      return 1
    }
    if (indexB == null) {
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
  changes: Record<string, chrome.storage.StorageChange>,
  refreshTabGroupsWithUrls: (nextGroups?: TabGroup[]) => Promise<TabGroup[]>,
  syncDomainDataToCustomProjects: () => Promise<CustomProject[]>,
): Promise<void> => {
  const hasSavedTabsChange = Boolean(changes.savedTabs)
  const hasUrlsChange = Boolean(changes.urls)

  if (hasUrlsChange) {
    invalidateUrlCache()
  }

  if (hasSavedTabsChange) {
    const nextSavedTabs = Array.isArray(changes.savedTabs.newValue)
      ? fromStorageChange(z.array(TabGroupSchema), changes.savedTabs.newValue)
      : []
    await refreshTabGroupsWithUrls(nextSavedTabs)
    await syncDomainDataToCustomProjects()
    return
  }

  if (hasUrlsChange) {
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
