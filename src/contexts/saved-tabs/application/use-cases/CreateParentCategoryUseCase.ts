import type { SavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsParentCategoryDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import { createCategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

/**
 * `CreateParentCategoryUseCase` の入力。
 *
 * `name` のみ必須。`id` は use-case 内で uuid v4 を採番して
 * `ParentCategory` を生成する。重複チェックは use-case 側で行う
 * （同名カテゴリの存在を `findAll` で確認）。
 */
export interface CreateParentCategoryCommand {
  readonly name: string
}

export interface CreateParentCategoryResult {
  readonly category: SavedTabsParentCategoryDto
  readonly all: readonly SavedTabsParentCategoryDto[]
}

/**
 * `CreateParentCategoryUseCase` の関数型。生成された
 * `ParentCategory` と全カテゴリ配列を返す。presentation 層は
 * 戻り値の `all` を state に反映して再描画する。
 */
export type CreateParentCategoryUseCase = (
  command: CreateParentCategoryCommand,
) => Promise<CreateParentCategoryResult>

/**
 * `CreateParentCategoryUseCase` が必要とする依存。
 */
export interface CreateParentCategoryUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
  /**
   * 新しい `ParentCategory.id` を採番する port。`uuid v4` 固定だと
   * テスト時の決定論性が落ちるため、port 経由で差し替えられる形にする。
   * 旧 `src/lib/storage/categories.createParentCategory` の `uuidv4()`
   * 呼び出しを置換する。
   */
  readonly generateId: () => string
}

/**
 * `CreateParentCategoryUseCase` を生成する。
 *
 * 責務:
 * 1. 既存カテゴリ一覧を `parentCategoryRepository.findAll` で取得する
 * 2. 同名 (`name.toLowerCase()`) のカテゴリが既にあれば
 *    `DUPLICATE_CATEGORY_NAME` 付き `Error` を投げる
 * 3. `generateId()` で採番した新規 `ParentCategory` を全カテゴリの
 *    末尾に追加して `parentCategoryRepository.saveAll` で保存する
 * 4. 戻り値は `{ category, all: updatedCategories }`
 *
 * 旧 `src/lib/storage/categories.createParentCategory` の DDD use-case 化
 * (issue #509)。`@/lib/storage/categories` を presentation 層から
 * 撤去するために必要。
 */
export const createCreateParentCategoryUseCase = (
  deps: CreateParentCategoryUseCaseDeps,
): CreateParentCategoryUseCase => {
  return async (command) => {
    const name = command.name.trim()
    if (name.length === 0) {
      throw new Error('DUPLICATE_CATEGORY_NAME:')
    }
    const all = await deps.parentCategoryRepository.findAll()
    const duplicate = all.find(
      (category) => category.name.toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      throw new Error(`DUPLICATE_CATEGORY_NAME:${name}`)
    }
    const newId = createParentCategoryId(deps.generateId())
    const newCategory: ParentCategory = {
      domainNames: [],
      domains: [],
      id: newId,
      name: createCategoryName(name),
    }
    const updatedAll: readonly ParentCategory[] = [...all, newCategory]
    await deps.parentCategoryRepository.saveAll(updatedAll)
    return {
      all: updatedAll.map(toSavedTabsParentCategoryDto),
      category: toSavedTabsParentCategoryDto(newCategory),
    }
  }
}
