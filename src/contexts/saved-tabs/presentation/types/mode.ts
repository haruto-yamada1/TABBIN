import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  ViewMode,
} from '@/types/storage'

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
