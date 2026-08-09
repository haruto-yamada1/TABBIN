import type {
  SavedTabsCustomProjectDto,
  SavedTabsDisplayTabGroupDto,
  SavedTabsParentCategoryDto,
  SavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

type CompactMembership = {
  readonly category?: string
  readonly notes?: string
  readonly urlId: string
}

export const createSavedTabsTabGroupDto = (input: {
  readonly categoryKeywords?: readonly {
    readonly categoryName: string
    readonly keywords: readonly string[]
  }[]
  readonly domain: string
  readonly id: string
  readonly memberships?: readonly CompactMembership[]
  readonly parentCategoryId?: string
  readonly savedAt?: number
  readonly subCategories?: readonly string[]
  readonly urls?: SavedTabsDisplayTabGroupDto['resolvedUrls']
  readonly urlIds?: readonly string[]
}): SavedTabsDisplayTabGroupDto => ({
  ...createTabGroup({
    ...input,
    memberships:
      input.memberships ?? input.urlIds?.map((urlId) => ({ urlId })) ?? [],
  }),
  ...(input.urls
    ? { resolvedUrls: input.urls.map((url) => ({ ...url })) }
    : {}),
})

export const createSavedTabsUrlRecordDto = (
  input: Partial<SavedTabsUrlRecordDto> &
    Pick<SavedTabsUrlRecordDto, 'id' | 'url'>,
): SavedTabsUrlRecordDto => ({
  id: input.id,
  savedAt: input.savedAt ?? 0,
  title: input.title ?? input.url,
  url: input.url,
  ...(input.favIconUrl ? { favIconUrl: input.favIconUrl } : {}),
})

export const createSavedTabsCustomProjectDto = (input: {
  readonly categories?: readonly string[]
  readonly createdAt?: number
  readonly id: string
  readonly memberships?: readonly CompactMembership[]
  readonly name: string
  readonly updatedAt?: number
  readonly urlIds?: readonly string[]
}): SavedTabsCustomProjectDto =>
  createCustomProject({
    ...input,
    memberships:
      input.memberships ?? input.urlIds?.map((urlId) => ({ urlId })) ?? [],
  })

export const createSavedTabsParentCategoryDto = (
  input: Partial<SavedTabsParentCategoryDto> &
    Pick<SavedTabsParentCategoryDto, 'id' | 'name'> & {
      domains?: string[]
      domainNames?: string[]
    },
): SavedTabsParentCategoryDto => ({
  collections:
    input.collections?.map((collection) => ({ ...collection })) ??
    input.domains?.map((id, index) => ({
      domain: input.domainNames?.[index] ?? id,
      id,
    })) ??
    [],
  id: input.id,
  name: input.name,
})
