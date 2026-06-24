import type {
  SavedTabsUserSettingsDto as UserSettingsDto,
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

export type ViewMode = 'domain' | 'custom'

export type ModeSyncEventType =
  | 'savedTabsUpdated'
  | 'customProjectsUpdated'
  | 'urlsUpdated'
  | 'settingsUpdated'
  | 'categoriesUpdated'

export interface ModeSyncEvent {
  type: ModeSyncEventType
}

export interface SavedTabsModeAdapter {
  readonly mode: ViewMode
  getGroups: () => Promise<TabGroup[]>
  getProjects: () => Promise<CustomProject[]>
  applySettings: (settings: Partial<UserSettingsDto>) => void
  applyCategories: (categories: ParentCategory[]) => void
}
