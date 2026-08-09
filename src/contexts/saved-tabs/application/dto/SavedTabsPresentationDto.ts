import type { CollectionReferenceDto } from '@/contexts/saved-tabs/domain/dto/CollectionProjectionDto'
import type { ResolvedTabGroupUrlDto } from '@/contexts/saved-tabs/domain/dto/ResolvedTabGroupUrlDto'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'

export type SavedTabsAiSystemPromptDto = {
  readonly id: string
  readonly name: string
  readonly template: string
  readonly createdAt: number
  readonly updatedAt: number
}

export type SavedTabsProjectKeywordSettingsDto = {
  titleKeywords: string[]
  urlKeywords: string[]
  domainKeywords: string[]
}

export type SavedTabsUserSettingsDto = {
  language?: 'system' | 'ja' | 'en'
  removeTabAfterOpen: boolean
  removeTabAfterExternalDrop: boolean
  excludePatterns: string[]
  enableCategories: boolean
  autoDeletePeriod?: string
  showSavedTime: boolean
  clickBehavior:
    | 'saveCurrentTab'
    | 'saveWindowTabs'
    | 'saveSameDomainTabs'
    | 'saveAllWindowsTabs'
  excludePinnedTabs: boolean
  openUrlInBackground: boolean
  openAllInNewWindow: boolean
  confirmDeleteAll: boolean
  confirmDeleteEach: boolean
  fontSizePercent?: number
  colors?: Record<string, string>
  ollamaModel?: string
  aiSystemPrompts?: SavedTabsAiSystemPromptDto[]
  activeAiSystemPromptId?: string
}

export type SavedTabsCustomProjectDto = CustomProject

export type SavedTabsParentCategoryDto = {
  readonly collections: readonly CollectionReferenceDto[]
  readonly id: string
  readonly name: string
}

export type SavedTabsTabGroupDto = TabGroup

export type SavedTabsDisplayUrlDto = {
  id?: string
  url: string
  title: string
  subCategory?: string
  savedAt?: number
}

/**
 * Hydrated collection projection used by the saved-tabs view. URL identity and
 * membership category are carried by each projected item rather than parallel
 * storage arrays/maps.
 */
export type SavedTabsDisplayTabGroupDto = TabGroup & {
  readonly resolvedUrls?: readonly ResolvedTabGroupUrlDto[]
}

export type SavedTabsUrlRecordDto = {
  readonly id: string
  readonly url: string
  readonly title: string
  readonly savedAt: number
  readonly favIconUrl?: string
}
