import type { SavedTabsUserSettingsDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsUserSettingsDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { UNCATEGORIZED_PROJECT_ID } from '@/contexts/saved-tabs/domain/entities/UncategorizedProject'
import { defaultUserSettings } from '@/contexts/saved-tabs/domain/services/UserSettingsDefaults'

export const savedTabsDefaultUserSettings: SavedTabsUserSettingsDto =
  toSavedTabsUserSettingsDto(defaultUserSettings)

export const savedTabsUncategorizedProjectId: string = UNCATEGORIZED_PROJECT_ID
