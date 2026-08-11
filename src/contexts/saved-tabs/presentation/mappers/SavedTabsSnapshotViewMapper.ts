import type { BuildSavedTabsSnapshotCommand } from '@/contexts/saved-tabs/application/commands/BuildSavedTabsSnapshotCommand'
import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type {
  SavedTabsCustomProjectDto,
  SavedTabsDisplayTabGroupDto,
  SavedTabsParentCategoryDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toDomainParentCategories as toCurrentParentCategories } from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import {
  toCustomProjectFromViewModel,
  toSavedTabsCustomProjectViewModel,
  toSavedTabsTabGroupViewModel,
  toTabGroupFromViewModel,
} from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type {
  SavedTabsCustomProjectViewModel,
  SavedTabsTabGroupViewModel,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

export const toStorageCustomProject = (
  project: SavedTabsCustomProjectDto,
): SavedTabsCustomProjectViewModel => toSavedTabsCustomProjectViewModel(project)

export const toStorageCustomProjectFromRaw = toStorageCustomProject

export const toStorageParentCategory = (
  category: SavedTabsParentCategoryDto,
): SavedTabsParentCategoryDto => ({
  collections: category.collections.map((collection) => ({ ...collection })),
  id: category.id,
  name: category.name,
})

export const toStorageTabGroup = (
  group: SavedTabsDisplayTabGroupDto,
): SavedTabsTabGroupViewModel => toSavedTabsTabGroupViewModel(group)

export const toPresentationTabGroups = (
  groups: readonly SavedTabsDisplayTabGroupDto[],
): SavedTabsTabGroupViewModel[] => groups.map(toSavedTabsTabGroupViewModel)

export const toDomainTabGroupFromStorage = (
  group: SavedTabsTabGroupViewModel,
): SavedTabsDisplayTabGroupDto => toTabGroupFromViewModel(group)

export const getSnapshotSavedTabs = (
  snapshot: OpenedUrlsRestoreSnapshot,
): SavedTabsTabGroupViewModel[] =>
  snapshot.savedTabs?.map(toSavedTabsTabGroupViewModel) ?? []

export const toDomainParentCategories = (
  categories: readonly SavedTabsParentCategoryDto[] | undefined,
): BuildSavedTabsSnapshotCommand['parentCategories'] =>
  toCurrentParentCategories(categories)

export const toDomainTabGroupsForReorder = (
  groups: readonly SavedTabsTabGroupViewModel[],
): readonly SavedTabsDisplayTabGroupDto[] => groups.map(toTabGroupFromViewModel)

export const toStorageCustomProjects = (
  snapshot: OpenedUrlsRestoreSnapshot,
): SavedTabsCustomProjectViewModel[] | undefined =>
  snapshot.customProjects?.map(toSavedTabsCustomProjectViewModel)

export const toStorageParentCategories = (
  snapshot: OpenedUrlsRestoreSnapshot,
): SavedTabsParentCategoryDto[] | undefined =>
  snapshot.parentCategories?.map(toStorageParentCategory)

export const toDomainTabGroupsFromStorage = toDomainTabGroupsForReorder

export const toSavedTabsTabGroupsFromStorage = (
  groups: readonly SavedTabsTabGroupViewModel[],
): readonly SavedTabsTabGroupViewModel[] =>
  groups.map((group) => ({ ...group }))

export const toDomainParentCategoriesFromStorage = (
  categories: readonly SavedTabsParentCategoryDto[],
): NonNullable<BuildSavedTabsSnapshotCommand['parentCategories']> =>
  toCurrentParentCategories(categories) ?? []

export const toDomainCustomProjectsFromStorage = (
  projects: readonly SavedTabsCustomProjectViewModel[],
): readonly SavedTabsCustomProjectDto[] =>
  projects.map(toCustomProjectFromViewModel)
