import type {
  SavedTabsAiSystemPromptDto as ApplicationSavedTabsAiSystemPromptDto,
  SavedTabsDisplayUrlDto as ApplicationSavedTabsDisplayUrlDto,
  SavedTabsParentCategoryDto as ApplicationSavedTabsParentCategoryDto,
  SavedTabsProjectKeywordSettingsDto as ApplicationSavedTabsProjectKeywordSettingsDto,
  SavedTabsUrlRecordDto as ApplicationSavedTabsUrlRecordDto,
  SavedTabsUserSettingsDto as ApplicationSavedTabsUserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

type CollectionMembershipViewModel = {
  readonly category?: string
  readonly notes?: string
  readonly urlId: string
}

export type SavedTabsAiSystemPromptDto = ApplicationSavedTabsAiSystemPromptDto
export type SavedTabsDisplayUrlDto = ApplicationSavedTabsDisplayUrlDto
export type SavedTabsParentCategoryDto = ApplicationSavedTabsParentCategoryDto
export type SavedTabsProjectKeywordSettingsDto =
  ApplicationSavedTabsProjectKeywordSettingsDto
export type SavedTabsUrlRecordDto = ApplicationSavedTabsUrlRecordDto
export type SavedTabsUserSettingsDto = ApplicationSavedTabsUserSettingsDto

export type SavedTabsCustomProjectUrlDto = {
  id?: string
  url: string
  title: string
  notes?: string
  savedAt?: number
  category?: string
}

export type SavedTabsCustomProjectViewModel = {
  id: string
  name: string
  memberships?: CollectionMembershipViewModel[]
  categories: string[]
  createdAt: number
  updatedAt: number
  projectKeywords?: SavedTabsProjectKeywordSettingsDto
  urls?: SavedTabsCustomProjectUrlDto[]
  categoryOrder?: string[]
}

export type SavedTabsCategoryKeywordViewModel = {
  categoryName: string
  keywords: string[]
}

export type SavedTabsTabGroupViewModel = {
  id: string
  domain: string
  memberships?: CollectionMembershipViewModel[]
  urls?: SavedTabsDisplayUrlDto[]
  subCategories?: string[]
  categoryKeywords?: SavedTabsCategoryKeywordViewModel[]
  subCategoryOrder?: string[]
  subCategoryOrderWithUncategorized?: string[]
  parentCategoryId?: string
  savedAt?: number
}

export type SavedTabsDisplayTabGroupViewModel = {
  id: string
  domain: string
  parentCategoryId?: string
  urls?: SavedTabsDisplayUrlDto[]
  subCategories?: string[]
  categoryKeywords?: SavedTabsCategoryKeywordViewModel[]
  subCategoryOrder?: string[]
  subCategoryOrderWithUncategorized?: string[]
  savedAt?: number
}

/** Compatibility names retained only inside the presentation boundary. */
export type SavedTabsCustomProjectDto = SavedTabsCustomProjectViewModel
export type SavedTabsCategoryKeywordDto = SavedTabsCategoryKeywordViewModel
export type SavedTabsDisplayCategoryKeywordDto =
  SavedTabsCategoryKeywordViewModel
export type SavedTabsDisplayTabGroupDto = SavedTabsDisplayTabGroupViewModel
export type SavedTabsTabGroupDto = SavedTabsTabGroupViewModel
