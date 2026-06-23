export interface SavedTabsAiSystemPromptDto {
  readonly id: string
  readonly name: string
  readonly template: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface SavedTabsUserSettingsDto {
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

export interface SavedTabsCustomProjectDto {
  readonly id: string
  readonly name: string
  readonly urlIds: readonly string[]
  readonly categories: readonly string[]
  readonly createdAt: number
  readonly updatedAt: number
}

export interface SavedTabsParentCategoryDto {
  readonly id: string
  readonly name: string
  readonly domains: readonly string[]
  readonly domainNames: readonly string[]
}

export interface SavedTabsCategoryKeywordDto {
  readonly categoryName: string
  readonly keywords: readonly string[]
}

export interface SavedTabsTabGroupDto {
  readonly id: string
  readonly domain: string
  readonly urlIds: readonly string[]
  readonly urlSubCategories?: Readonly<Record<string, string>>
  readonly subCategories?: readonly string[]
  readonly categoryKeywords?: readonly SavedTabsCategoryKeywordDto[]
  readonly subCategoryOrder?: readonly string[]
  readonly subCategoryOrderWithUncategorized?: readonly string[]
  readonly parentCategoryId?: string
  readonly savedAt?: number
}

export interface SavedTabsDisplayUrlDto {
  id?: string
  url: string
  title: string
  subCategory?: string
  savedAt?: number
}

export interface SavedTabsDisplayCategoryKeywordDto {
  categoryName: string
  keywords: string[]
}

/**
 * Storage migration fields and hydrated URL data used by the saved-tabs view.
 * This is separate from `SavedTabsTabGroupDto`, whose `urlIds` are guaranteed
 * by the domain entity mapper.
 */
export interface SavedTabsDisplayTabGroupDto {
  id: string
  domain: string
  parentCategoryId?: string
  urlIds?: string[]
  urls?: SavedTabsDisplayUrlDto[]
  urlSubCategories?: Record<string, string>
  subCategories?: string[]
  categoryKeywords?: SavedTabsDisplayCategoryKeywordDto[]
  subCategoryOrder?: string[]
  subCategoryOrderWithUncategorized?: string[]
  savedAt?: number
}

export interface SavedTabsUrlRecordDto {
  readonly id: string
  readonly url: string
  readonly title: string
  readonly savedAt: number
  readonly favIconUrl?: string
}
