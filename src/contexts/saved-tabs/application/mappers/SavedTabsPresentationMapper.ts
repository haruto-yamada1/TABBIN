import type {
  SavedTabsCustomProjectDto,
  SavedTabsDisplayTabGroupDto,
  SavedTabsParentCategoryDto,
  SavedTabsTabGroupDto,
  SavedTabsUrlRecordDto,
  SavedTabsUserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] }

export const toSavedTabsUserSettingsDto = (
  settings: UserSettingsDto,
): SavedTabsUserSettingsDto => {
  const dto: SavedTabsUserSettingsDto = {
    clickBehavior: settings.clickBehavior,
    confirmDeleteAll: settings.confirmDeleteAll,
    confirmDeleteEach: settings.confirmDeleteEach,
    enableCategories: settings.enableCategories,
    excludePatterns: [...settings.excludePatterns],
    excludePinnedTabs: settings.excludePinnedTabs,
    openAllInNewWindow: settings.openAllInNewWindow,
    openUrlInBackground: settings.openUrlInBackground,
    removeTabAfterExternalDrop: settings.removeTabAfterExternalDrop,
    removeTabAfterOpen: settings.removeTabAfterOpen,
    showSavedTime: settings.showSavedTime,
  }
  if (settings.activeAiSystemPromptId !== undefined) {
    dto.activeAiSystemPromptId = settings.activeAiSystemPromptId
  }
  if (settings.aiSystemPrompts !== undefined) {
    dto.aiSystemPrompts = settings.aiSystemPrompts.map((preset) => ({
      createdAt: preset.createdAt,
      id: preset.id,
      name: preset.name,
      template: preset.template,
      updatedAt: preset.updatedAt,
    }))
  }
  if (settings.autoDeletePeriod !== undefined) {
    dto.autoDeletePeriod = settings.autoDeletePeriod
  }
  if (settings.colors !== undefined) {
    dto.colors = { ...settings.colors }
  }
  if (settings.fontSizePercent !== undefined) {
    dto.fontSizePercent = settings.fontSizePercent
  }
  if (settings.language !== undefined) {
    dto.language = settings.language
  }
  if (settings.ollamaModel !== undefined) {
    dto.ollamaModel = settings.ollamaModel
  }
  return dto
}

const cloneCustomProjectInput = (
  project: CustomProject,
): Parameters<typeof createCustomProject>[0] => ({
  collection: {
    ...project.collection,
    definition: {
      ...project.collection.definition,
      projectKeywords: {
        domainKeywords: [
          ...project.collection.definition.projectKeywords.domainKeywords,
        ],
        titleKeywords: [
          ...project.collection.definition.projectKeywords.titleKeywords,
        ],
        urlKeywords: [
          ...project.collection.definition.projectKeywords.urlKeywords,
        ],
      },
    },
  },
  collectionCategories: project.collectionCategories.map((category) => ({
    ...category,
    keywords: [...category.keywords],
  })),
  memberships: project.memberships.map((membership) => ({ ...membership })),
})

export const toSavedTabsCustomProjectDto = (
  project: CustomProject,
): SavedTabsCustomProjectDto =>
  createCustomProject(cloneCustomProjectInput(project))

export const toSavedTabsParentCategoryDto = (
  category: ParentCategory,
): SavedTabsParentCategoryDto => ({
  collections: category.collections.map(({ domain, id }) => ({ domain, id })),
  id: category.id,
  name: category.name,
})

const cloneTabGroupInput = (
  group: TabGroup,
): Parameters<typeof createTabGroup>[0] => ({
  collection: {
    ...group.collection,
    definition: { ...group.collection.definition },
  },
  collectionCategories: group.collectionCategories.map((category) => ({
    ...category,
    keywords: [...category.keywords],
  })),
  memberships: group.memberships.map((membership) => ({ ...membership })),
})

export const toSavedTabsTabGroupDto = (group: TabGroup): SavedTabsTabGroupDto =>
  createTabGroup(cloneTabGroupInput(group))

export const createSavedTabsTabGroupDtoFromProjection = (
  input: Parameters<typeof createTabGroup>[0],
): SavedTabsTabGroupDto => createTabGroup(input)

export const createSavedTabsCustomProjectDtoFromProjection = (
  input: Parameters<typeof createCustomProject>[0],
): SavedTabsCustomProjectDto => createCustomProject(input)

export const toSavedTabsDisplayTabGroupDto = (
  group: TabGroup,
): SavedTabsDisplayTabGroupDto => toSavedTabsTabGroupDto(group)

export const toSavedTabsUrlRecordDto = (
  record: UrlRecord,
): SavedTabsUrlRecordDto => {
  const dto: Mutable<SavedTabsUrlRecordDto> = {
    id: record.id,
    savedAt: record.savedAt,
    title: record.title,
    url: record.url,
  }
  if (record.favIconUrl !== undefined) {
    dto.favIconUrl = record.favIconUrl
  }
  return dto
}

export const toCreateTabGroupInput = (
  dto: SavedTabsTabGroupDto,
): Parameters<typeof createTabGroup>[0] => cloneTabGroupInput(dto)

export const toCreateCustomProjectInput = (
  dto: SavedTabsCustomProjectDto,
): Parameters<typeof createCustomProject>[0] => cloneCustomProjectInput(dto)
