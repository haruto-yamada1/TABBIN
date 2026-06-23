import type {
  SavedTabsCustomProjectDto,
  SavedTabsParentCategoryDto,
  SavedTabsTabGroupDto,
  SavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

export const createSavedTabsTabGroupDto = (
  input: Partial<SavedTabsTabGroupDto> &
    Pick<SavedTabsTabGroupDto, 'id' | 'domain'>,
): SavedTabsTabGroupDto => ({
  id: input.id,
  domain: input.domain,
  urlIds: [...(input.urlIds ?? [])],
  ...(input.parentCategoryId
    ? { parentCategoryId: input.parentCategoryId }
    : {}),
  ...(input.savedAt === undefined ? {} : { savedAt: input.savedAt }),
})

export const createSavedTabsUrlRecordDto = (
  input: Partial<SavedTabsUrlRecordDto> &
    Pick<SavedTabsUrlRecordDto, 'id' | 'url'>,
): SavedTabsUrlRecordDto => ({
  id: input.id,
  url: input.url,
  title: input.title ?? input.url,
  savedAt: input.savedAt ?? 0,
  ...(input.favIconUrl ? { favIconUrl: input.favIconUrl } : {}),
})

export const createSavedTabsCustomProjectDto = (
  input: Partial<SavedTabsCustomProjectDto> &
    Pick<SavedTabsCustomProjectDto, 'id' | 'name'>,
): SavedTabsCustomProjectDto => ({
  id: input.id,
  name: input.name,
  urlIds: [...(input.urlIds ?? [])],
  categories: [...(input.categories ?? [])],
  createdAt: input.createdAt ?? 0,
  updatedAt: input.updatedAt ?? 0,
})

export const createSavedTabsParentCategoryDto = (
  input: Partial<SavedTabsParentCategoryDto> &
    Pick<SavedTabsParentCategoryDto, 'id' | 'name'>,
): SavedTabsParentCategoryDto => ({
  id: input.id,
  name: input.name,
  domains: [...(input.domains ?? [])],
  domainNames: [...(input.domainNames ?? [])],
})
