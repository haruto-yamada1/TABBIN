import type { UserSettingsDto } from '../../domain/dto/UserSettingsDto'
import type { ParentCategory } from '../../domain/entities/ParentCategory'
import type { TabGroup } from '../../domain/entities/TabGroup'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UserSettingsRepository } from '../../domain/repositories/UserSettingsRepository'

/**
 * presentation 層が page 表示 / フォーム初期化で必要とする
 * 「保存タブページ全体」の読み取り専用スナップショット。
 *
 * 旧 `@/lib/storage/tabs` / `@/lib/storage/categories` / `@/lib/storage/settings`
 * を直接呼んで `getTabGroups` / `getParentCategories` / `getUserSettings`
 * を並列 fetch していたパスを 1 つの query にまとめる
 * (issue #510)。
 *
 * `userSettings` は `@/types/storage.UserSettings` ではなく
 * domain DTO `UserSettingsDto` を返す (issue #511)。
 * `tabGroups` / `parentCategories` は branded domain entity のまま。
 */
export interface SavedTabsPageDataDto {
  readonly tabGroups: readonly TabGroup[]
  readonly parentCategories: readonly ParentCategory[]
  readonly userSettings: UserSettingsDto
}

/**
 * `GetSavedTabsPageDataQuery` の関数型。引数なし。
 */
export type GetSavedTabsPageDataQuery = () => Promise<SavedTabsPageDataDto>

/**
 * `GetSavedTabsPageDataQuery` が依存する repository 群。
 */
export interface GetSavedTabsPageDataQueryDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly userSettingsRepository: UserSettingsRepository
}

/**
 * `GetSavedTabsPageDataQuery` を生成する。
 *
 * 責務:
 * 1. `tabGroupRepository.findAll()` / `parentCategoryRepository.findAll()` /
 *    `userSettingsRepository.findAll()` を `Promise.all` で並列呼び出しし、
 *    presentation 層へ 1 つの DTO として返す。
 * 2. presentation 層は repository を直接受け取らず、本 query だけを
 *    受け取る形になる (issue #510 受け入れ条件)。
 *
 * 旧 `@/lib/storage/{tabs,categories,settings}.get*` の
 * domain 等価物。
 *
 * `@/types/storage` には依存せず、domain entity / domain DTO
 * (`TabGroup` / `ParentCategory` / `UserSettingsDto`) だけを返す
 * (issue #511)。
 */
export const createGetSavedTabsPageDataQuery = (
  deps: GetSavedTabsPageDataQueryDeps,
): GetSavedTabsPageDataQuery => {
  return async (): Promise<SavedTabsPageDataDto> => {
    const [tabGroups, parentCategories, userSettings] = await Promise.all([
      deps.tabGroupRepository.findAll(),
      deps.parentCategoryRepository.findAll(),
      deps.userSettingsRepository.findAll(),
    ])
    return {
      tabGroups,
      parentCategories,
      userSettings,
    }
  }
}
