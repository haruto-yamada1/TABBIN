import {
  createSavedTabsCustomProjectDto as createCurrentCustomProject,
  createSavedTabsParentCategoryDto,
  createSavedTabsTabGroupDto as createCurrentTabGroup,
  createSavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures'
import {
  toSavedTabsCustomProjectViewModel,
  toSavedTabsTabGroupViewModel,
} from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'

export const createSavedTabsTabGroupDto = (
  input: Parameters<typeof createCurrentTabGroup>[0],
) => toSavedTabsTabGroupViewModel(createCurrentTabGroup(input))

export const createSavedTabsCustomProjectDto = (
  input: Parameters<typeof createCurrentCustomProject>[0],
) => toSavedTabsCustomProjectViewModel(createCurrentCustomProject(input))

export { createSavedTabsParentCategoryDto, createSavedTabsUrlRecordDto }
