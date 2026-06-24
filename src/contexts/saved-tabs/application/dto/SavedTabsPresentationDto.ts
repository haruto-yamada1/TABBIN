export interface SavedTabsAiSystemPromptDto {
  readonly id: string
  readonly name: string
  readonly template: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface SavedTabsProjectKeywordSettingsDto {
  titleKeywords: string[]
  urlKeywords: string[]
  domainKeywords: string[]
}

export interface SavedTabsCustomProjectUrlDto {
  id?: string
  url: string
  title: string
  notes?: string
  savedAt?: number
  category?: string
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
  id: string
  name: string
  urlIds?: string[]
  categories: string[]
  createdAt: number
  updatedAt: number
  projectKeywords?: SavedTabsProjectKeywordSettingsDto
  urls?: SavedTabsCustomProjectUrlDto[]
  urlMetadata?: Record<string, { notes?: string; category?: string }>
  categoryOrder?: string[]
}

export interface SavedTabsParentCategoryDto {
  readonly id: string
  readonly name: string
  readonly domains: readonly string[]
  readonly domainNames: readonly string[]
}

export interface SavedTabsCategoryKeywordDto {
  categoryName: string
  keywords: string[]
}

export interface SavedTabsTabGroupDto {
  id: string
  domain: string
  urlIds?: string[]
  urlSubCategories?: Record<string, string>
  subCategories?: string[]
  categoryKeywords?: SavedTabsCategoryKeywordDto[]
  subCategoryOrder?: string[]
  subCategoryOrderWithUncategorized?: string[]
  parentCategoryId?: string
  savedAt?: number
  urls?: SavedTabsDisplayUrlDto[]
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
