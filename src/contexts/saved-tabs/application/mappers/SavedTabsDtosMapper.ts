import type {
  SavedTabsAiSystemPromptDto as AiSystemPromptPreset,
  SavedTabsUserSettingsDto as UserSettings,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type {
  DomainCategoryMappingDto as DomainParentCategoryMapping,
  DomainCategoryMappingDto,
} from '@/contexts/saved-tabs/domain/dto/DomainCategoryMappingDto'
import type {
  AiSystemPromptPresetDto,
  UserSettingsDto,
} from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
/**
 * `@/types/storage` 形 (chrome.storage 互換) と domain DTO 間の
 * 純変換を集約する application mapper (issue #511)。
 *
 * 役割分担:
 * - domain entity / DTO ↔ storage 形 変換の責務を集約
 * - 旧 `SavedTabsSnapshotMapper` が entity ↔ storage 形を担うのと
 *   対をなし、本 mapper は「DTO ↔ storage 形」を担う
 * - chrome.storage 実装 (`Chrome*Repository`) は zod parse 結果を
 *   本 mapper 経由で DTO 化 / storage 形化する
 *
 * DTO は `@/types/storage` と構造互換 (配列・オブジェクトフィールドは
 * mutable) なので、本 mapper は `chrome.storage.local` への
 * 読み書きでフィールドのコピーが最小限で済む。
 */

/**
 * storage 形 `UserSettings` を domain DTO へコピーする。
 *
 * 全フィールドが構造互換なので、明示的な列挙で「将来 storage 形に
 * フィールドが追加されたときの差分を可視化」する。`UserSettingsDto` の
 * 配列・オブジェクトフィールドは mutable のため、storage 形の
 * 値をそのまま詰め替える。
 */
export const toUserSettingsDto = (storage: UserSettings): UserSettingsDto => ({
  ...(storage.activeAiSystemPromptId !== undefined
    ? { activeAiSystemPromptId: storage.activeAiSystemPromptId }
    : {}),
  ...(storage.aiSystemPrompts !== undefined
    ? {
        aiSystemPrompts: storage.aiSystemPrompts.map(toAiSystemPromptPresetDto),
      }
    : {}),
  ...(storage.autoDeletePeriod !== undefined
    ? { autoDeletePeriod: storage.autoDeletePeriod }
    : {}),
  clickBehavior: storage.clickBehavior,
  ...(storage.colors !== undefined ? { colors: storage.colors } : {}),
  confirmDeleteAll: storage.confirmDeleteAll,
  confirmDeleteEach: storage.confirmDeleteEach,
  enableCategories: storage.enableCategories,
  excludePatterns: [...storage.excludePatterns],
  excludePinnedTabs: storage.excludePinnedTabs,
  ...(storage.fontSizePercent !== undefined
    ? { fontSizePercent: storage.fontSizePercent }
    : {}),
  ...(storage.language !== undefined ? { language: storage.language } : {}),
  ...(storage.ollamaModel !== undefined
    ? { ollamaModel: storage.ollamaModel }
    : {}),
  openAllInNewWindow: storage.openAllInNewWindow,
  openUrlInBackground: storage.openUrlInBackground,
  removeTabAfterExternalDrop: storage.removeTabAfterExternalDrop,
  removeTabAfterOpen: storage.removeTabAfterOpen,
  showSavedTime: storage.showSavedTime,
})

/**
 * domain DTO を storage 形 `UserSettings` へ逆変換する。
 *
 * `chrome.storage.local.set` の payload 用に DTO の配列を
 * 新規インスタンスへコピーする点が、`toUserSettingsDto` との主な差分。
 */
export const toStorageUserSettings = (dto: UserSettingsDto): UserSettings => {
  // OK: structural copy with optional fields stripped from undefined.
  // `excludePatterns` は必須フィールドなので常にコピーする。
  const result: UserSettings = {
    clickBehavior: dto.clickBehavior,
    confirmDeleteAll: dto.confirmDeleteAll,
    confirmDeleteEach: dto.confirmDeleteEach,
    enableCategories: dto.enableCategories,
    excludePatterns: [...dto.excludePatterns],
    excludePinnedTabs: dto.excludePinnedTabs,
    openAllInNewWindow: dto.openAllInNewWindow,
    openUrlInBackground: dto.openUrlInBackground,
    removeTabAfterExternalDrop: dto.removeTabAfterExternalDrop,
    removeTabAfterOpen: dto.removeTabAfterOpen,
    showSavedTime: dto.showSavedTime,
  }
  if (dto.activeAiSystemPromptId !== undefined) {
    result.activeAiSystemPromptId = dto.activeAiSystemPromptId
  }
  if (dto.aiSystemPrompts !== undefined) {
    result.aiSystemPrompts = dto.aiSystemPrompts.map(
      toStorageAiSystemPromptPreset,
    )
  }
  if (dto.autoDeletePeriod !== undefined) {
    result.autoDeletePeriod = dto.autoDeletePeriod
  }
  if (dto.colors !== undefined) {
    result.colors = dto.colors
  }
  if (dto.fontSizePercent !== undefined) {
    result.fontSizePercent = dto.fontSizePercent
  }
  if (dto.language !== undefined) {
    result.language = dto.language
  }
  if (dto.ollamaModel !== undefined) {
    result.ollamaModel = dto.ollamaModel
  }
  return result
}

const toAiSystemPromptPresetDto = (
  preset: AiSystemPromptPreset,
): AiSystemPromptPresetDto => ({
  createdAt: preset.createdAt,
  id: preset.id,
  name: preset.name,
  template: preset.template,
  updatedAt: preset.updatedAt,
})

const toStorageAiSystemPromptPreset = (
  preset: AiSystemPromptPresetDto,
): AiSystemPromptPreset => ({
  createdAt: preset.createdAt,
  id: preset.id,
  name: preset.name,
  template: preset.template,
  updatedAt: preset.updatedAt,
})

/**
 * storage 形 `DomainParentCategoryMapping[]` を domain DTO 配列へ変換する。
 */
export const toDomainCategoryMappingDtoArray = (
  storage: readonly DomainParentCategoryMapping[],
): readonly DomainCategoryMappingDto[] =>
  storage.map((mapping) => ({
    categoryId: mapping.categoryId,
    domain: mapping.domain,
  }))

/**
 * domain DTO 配列を storage 形 `DomainParentCategoryMapping[]` へ逆変換する。
 */
export const toStorageDomainCategoryMappings = (
  dto: readonly DomainCategoryMappingDto[],
): readonly DomainParentCategoryMapping[] =>
  dto.map((mapping) => ({
    categoryId: mapping.categoryId,
    domain: mapping.domain,
  }))

/**
 * storage 形 `DomainCategorySettings[]` を domain DTO 配列へ変換する。
 */
