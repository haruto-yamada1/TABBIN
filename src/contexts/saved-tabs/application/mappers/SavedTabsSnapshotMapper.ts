import type { BuildSavedTabsSnapshotCommand } from '@/contexts/saved-tabs/application/commands/BuildSavedTabsSnapshotCommand'
import type {
  OpenedUrlsRestoreSnapshot,
  RestoreOpenedUrlsSnapshotCommand,
} from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type {
  SavedTabsCustomProjectDto,
  SavedTabsDisplayTabGroupDto,
  SavedTabsParentCategoryDto,
  SavedTabsTabGroupDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'

import {
  toCreateCustomProjectInput,
  toCreateTabGroupInput,
  toSavedTabsCustomProjectDto,
  toSavedTabsTabGroupDto,
} from './SavedTabsPresentationMapper'

export const toStorageCustomProject = (
  project: CustomProject,
): SavedTabsCustomProjectDto => toSavedTabsCustomProjectDto(project)

export const toStorageCustomProjectFromRaw = (
  raw: SavedTabsCustomProjectDto,
): SavedTabsCustomProjectDto => toSavedTabsCustomProjectDto(raw)

export const toStorageParentCategory = (
  category: SavedTabsParentCategoryDto,
): SavedTabsParentCategoryDto => ({
  collections: category.collections.map((collection) => ({ ...collection })),
  id: category.id,
  name: category.name,
})

export const toStorageTabGroup = (group: TabGroup): SavedTabsTabGroupDto =>
  toSavedTabsTabGroupDto(group)

export const toPresentationTabGroups = (
  groups: readonly (SavedTabsTabGroupDto | SavedTabsDisplayTabGroupDto)[],
): SavedTabsTabGroupDto[] => groups.map(toSavedTabsTabGroupDto)

export const toDomainTabGroupFromStorage = (
  group: SavedTabsTabGroupDto,
): TabGroup => toSavedTabsTabGroupDto(group)

function getSnapshotArray<T>(value: readonly T[] | undefined): T[] | undefined {
  return Array.isArray(value) ? value.slice() : undefined
}

export const getSnapshotSavedTabs = (
  snapshot: OpenedUrlsRestoreSnapshot,
): SavedTabsTabGroupDto[] =>
  getSnapshotArray(snapshot.savedTabs)?.map(toSavedTabsTabGroupDto) ?? []

export const toDomainParentCategories = (
  categories: readonly SavedTabsParentCategoryDto[] | undefined,
): BuildSavedTabsSnapshotCommand['parentCategories'] => {
  if (!categories) {
    return undefined
  }
  return categories.map((category) => createParentCategory(category))
}

export const toDomainTabGroupsForReorder = (
  groups: readonly SavedTabsTabGroupDto[],
): readonly TabGroup[] => groups.map(toDomainTabGroupFromStorage)

export const toRestoreOpenedUrlsSnapshotCommand = (
  snapshot: OpenedUrlsRestoreSnapshot,
): RestoreOpenedUrlsSnapshotCommand => ({ snapshot })

export const toStorageCustomProjects = (
  snapshot: OpenedUrlsRestoreSnapshot,
): SavedTabsCustomProjectDto[] | undefined =>
  snapshot.customProjects?.map(toSavedTabsCustomProjectDto)

export const toStorageParentCategories = (
  snapshot: OpenedUrlsRestoreSnapshot,
): SavedTabsParentCategoryDto[] | undefined =>
  snapshot.parentCategories?.map(toStorageParentCategory)

export const toDomainTabGroupsFromStorage = (
  groups: readonly SavedTabsTabGroupDto[],
): readonly TabGroup[] => groups.map(toDomainTabGroupFromStorage)

export const toSavedTabsTabGroupsFromStorage = (
  groups: readonly SavedTabsTabGroupDto[],
): readonly SavedTabsTabGroupDto[] => groups.map(toSavedTabsTabGroupDto)

export const toDomainParentCategoriesFromStorage = (
  categories: readonly SavedTabsParentCategoryDto[],
): readonly ParentCategory[] =>
  categories.map((category) => createParentCategory(category))

// Keep the factory-input helpers reachable for compatibility callers while the
// values themselves remain normalized Collection projections.
export { toCreateCustomProjectInput, toCreateTabGroupInput }
