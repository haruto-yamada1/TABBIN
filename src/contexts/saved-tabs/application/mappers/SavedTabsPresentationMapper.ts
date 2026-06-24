import type {
  SavedTabsCustomProjectDto,
  SavedTabsDisplayTabGroupDto,
  SavedTabsParentCategoryDto,
  SavedTabsTabGroupDto,
  SavedTabsUrlRecordDto,
  SavedTabsUserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type {
  createCustomProject,
  CustomProject,
} from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type {
  createTabGroup,
  TabGroup,
} from '@/contexts/saved-tabs/domain/entities/TabGroup'
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

export const toSavedTabsCustomProjectDto = (
  project: CustomProject,
): SavedTabsCustomProjectDto => ({
  categories: [...project.categories],
  createdAt: project.createdAt,
  id: project.id,
  name: project.name,
  updatedAt: project.updatedAt,
  urlIds: [...project.urlIds],
})

export const toSavedTabsParentCategoryDto = (
  category: ParentCategory,
): SavedTabsParentCategoryDto => ({
  domainNames: [...category.domainNames],
  domains: [...category.domains],
  id: category.id,
  name: category.name,
})

export const toSavedTabsTabGroupDto = (
  group: TabGroup,
): SavedTabsTabGroupDto => {
  const dto: Mutable<SavedTabsTabGroupDto> = {
    domain: group.domain,
    id: group.id,
    urlIds: [...group.urlIds],
  }
  if (group.categoryKeywords !== undefined) {
    dto.categoryKeywords = group.categoryKeywords.map((entry) => ({
      categoryName: entry.categoryName,
      keywords: [...entry.keywords],
    }))
  }
  if (group.parentCategoryId !== undefined) {
    dto.parentCategoryId = group.parentCategoryId
  }
  if (group.savedAt !== undefined) {
    dto.savedAt = group.savedAt
  }
  if (group.subCategories !== undefined) {
    dto.subCategories = [...group.subCategories]
  }
  if (group.subCategoryOrder !== undefined) {
    dto.subCategoryOrder = [...group.subCategoryOrder]
  }
  if (group.subCategoryOrderWithUncategorized !== undefined) {
    dto.subCategoryOrderWithUncategorized = [
      ...group.subCategoryOrderWithUncategorized,
    ]
  }
  if (group.urlSubCategories !== undefined) {
    dto.urlSubCategories = { ...group.urlSubCategories }
  }
  return dto
}

export const toSavedTabsDisplayTabGroupDto = (
  group: TabGroup,
): SavedTabsDisplayTabGroupDto => {
  const dto = toSavedTabsTabGroupDto(group)
  return {
    domain: dto.domain,
    id: dto.id,
    ...(dto.urlIds ? { urlIds: [...dto.urlIds] } : {}),
    ...(dto.parentCategoryId ? { parentCategoryId: dto.parentCategoryId } : {}),
    ...(dto.savedAt === undefined ? {} : { savedAt: dto.savedAt }),
    ...(dto.urlSubCategories
      ? { urlSubCategories: { ...dto.urlSubCategories } }
      : {}),
    ...(dto.subCategories ? { subCategories: [...dto.subCategories] } : {}),
    ...(dto.categoryKeywords
      ? {
          categoryKeywords: dto.categoryKeywords.map((entry) => ({
            categoryName: entry.categoryName,
            keywords: [...entry.keywords],
          })),
        }
      : {}),
    ...(dto.subCategoryOrder
      ? { subCategoryOrder: [...dto.subCategoryOrder] }
      : {}),
    ...(dto.subCategoryOrderWithUncategorized
      ? {
          subCategoryOrderWithUncategorized: [
            ...dto.subCategoryOrderWithUncategorized,
          ],
        }
      : {}),
  }
}

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

/**
 * `SavedTabsTabGroupDto` から domain factory 入力へ変換する。
 *
 * application DTO は storage 互換で `urlIds` を省略可能にしているが、
 * domain factory では必須なので未設定時は空配列に正規化する。
 */
export const toCreateTabGroupInput = (
  dto: SavedTabsTabGroupDto,
): Parameters<typeof createTabGroup>[0] => ({
  categoryKeywords: dto.categoryKeywords,
  domain: dto.domain,
  id: dto.id,
  parentCategoryId: dto.parentCategoryId,
  savedAt: dto.savedAt,
  subCategories: dto.subCategories,
  subCategoryOrder: dto.subCategoryOrder,
  subCategoryOrderWithUncategorized: dto.subCategoryOrderWithUncategorized,
  urlIds: dto.urlIds ?? [],
  urlSubCategories: dto.urlSubCategories,
})

/**
 * `SavedTabsCustomProjectDto` から domain factory 入力へ変換する。
 *
 * application DTO は storage 互換で `urlIds` を省略可能にしているが、
 * domain factory では必須なので未設定時は空配列に正規化する。
 * storage 互換の rich フィールド (`urls` / `urlMetadata` /
 * `projectKeywords` / `categoryOrder`) は domain 入力に不要なので無視する。
 */
export const toCreateCustomProjectInput = (
  dto: SavedTabsCustomProjectDto,
): Parameters<typeof createCustomProject>[0] => ({
  categories: dto.categories,
  createdAt: dto.createdAt,
  id: dto.id,
  name: dto.name,
  updatedAt: dto.updatedAt,
  urlIds:
    dto.urlIds ??
    (dto.urls ? dto.urls.map((_, index) => `url-${index}`) : []),
})
