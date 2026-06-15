/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
import type { ParentCategory } from '../../domain/entities/ParentCategory'
import { parentCategoryById } from '../../domain/entities/ParentCategory'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { DomainCategoryMappingRepository } from '../../domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import { createParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'

/**
 * `AssignDomainToCategoryUseCase` の入力。
 *
 * `domainId` は `TabGroup.id` を表す。`categoryId` が `'none'` 相当
 * (`UNCATEGORIZED_SENTINEL`) のときはマッピング削除と他カテゴリからの
 * 取り除きのみを行い、対象カテゴリの `domains` / `domainNames` には
 * 追加しない。
 */
export interface AssignDomainToCategoryCommand {
  readonly domainId: string
  readonly categoryId: string
}

/**
 * 未分類を表すセンチネル値。presentation 層から `'none'` 文字列で
 * 渡されるケースと互換。`createParentCategoryId` の対象にもならない。
 */
export const UNCATEGORIZED_SENTINEL = 'none' as const

export interface AssignDomainToCategoryResult {
  readonly all: readonly ParentCategory[]
  readonly mappings: readonly { domain: string; categoryId: string }[]
}

/**
 * `AssignDomainToCategoryUseCase` の関数型。
 */
export type AssignDomainToCategoryUseCase = (
  command: AssignDomainToCategoryCommand,
) => Promise<AssignDomainToCategoryResult>

/**
 * `AssignDomainToCategoryUseCase` が必要とする依存。
 */
export interface AssignDomainToCategoryUseCaseDeps {
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
  readonly tabGroupRepository: TabGroupRepository
}

const isMappingsEqual = (
  a: readonly { domain: string; categoryId: string }[],
  b: readonly { domain: string; categoryId: string }[],
): boolean => {
  if (a.length !== b.length) {
    return false
  }
  return a.every(
    (mapping, index) =>
      mapping.domain === b[index]?.domain &&
      mapping.categoryId === b[index]?.categoryId,
  )
}

/**
 * `AssignDomainToCategoryUseCase` を生成する。
 *
 * 責務:
 * 1. 既存 `ParentCategory` 一覧を取得
 * 2. `tabGroupRepository.findById` で対象 `TabGroup` を探す
 *    - 見つからない場合 / `domain` 未設定時は no-op（presentation 層
 *      側での事前保証を推奨）
 * 3. `DomainCategoryMappingRepository` を使って、対象ドメインの
 *    マッピングを差し替える（`'none'` の場合はマッピング削除）
 * 4. `ParentCategory` 一覧を更新:
 *    - 対象 `categoryId` を持つカテゴリに `domainId` と `domain` 名を
 *      追加（重複は避ける）
 *    - 他のカテゴリからは `domainId` / `domain` 名を除去
 *
 * 旧 `src/lib/storage/migration.assignDomainToCategory` の DDD use-case 化
 * (issue #509)。`@/lib/storage/migration` を presentation 層から撤去する
 * ために必要。
 */
export const createAssignDomainToCategoryUseCase = (
  deps: AssignDomainToCategoryUseCaseDeps,
): AssignDomainToCategoryUseCase => {
  return async (command) => {
    const all = await deps.parentCategoryRepository.findAll()
    const tabGroupId = createTabGroupId(command.domainId)
    const tabGroup = await deps.tabGroupRepository.findById(tabGroupId)
    // PR #514 review P1: `domainCategoryMappings` / `parentCategory.domainNames`
    // の lookup キーは schemeful 形式（`https://example.com`）を期待するため、
    // entity 化された `DomainName`（hostname 形式に正規化済み）ではなく
    // storage に書かれている生の domain 文字列を使う。
    const rawDomain = tabGroup
      ? // eslint-disable-next-line typescript/no-unsafe-type-assertion
        ((await deps.tabGroupRepository.findRawDomainById(tabGroupId)) ??
        (tabGroup.domain as unknown as string))
      : null

    const targetDomain = rawDomain

    // 1) ドメイン-親カテゴリマッピング更新
    let nextMappings: { domain: string; categoryId: string }[]
    const currentMappings = await deps.domainCategoryMappingRepository.findAll()
    if (targetDomain) {
      const withoutDomain = currentMappings.filter(
        (mapping) => mapping.domain !== targetDomain,
      )
      if (command.categoryId === UNCATEGORIZED_SENTINEL) {
        nextMappings = [...withoutDomain]
      } else {
        nextMappings = [
          ...withoutDomain,
          { categoryId: command.categoryId, domain: targetDomain },
        ]
      }
    } else {
      nextMappings = [...currentMappings]
    }
    if (!isMappingsEqual(nextMappings, currentMappings)) {
      await deps.domainCategoryMappingRepository.saveAll(nextMappings)
    }

    // 2) 親カテゴリの domains / domainNames 更新
    const targetCategoryId: ParentCategoryId | null =
      command.categoryId === UNCATEGORIZED_SENTINEL
        ? null
        : createParentCategoryId(command.categoryId)

    if (!targetCategoryId) {
      // 未分類へ戻す: 他カテゴリから domainId / domain 名を取り除く
      // eslint-disable-next-line typescript/no-unsafe-type-assertion
      const target = parentCategoryById(all, '' as never)
      void target
    }

    const commandDomainId = command.domainId
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const updatedCategories = all.map((category) => {
      if (targetCategoryId && category.id === targetCategoryId) {
        if (!targetDomain) {
          return category
        }
        const hasDomainId = (category.domains as readonly string[]).includes(
          commandDomainId,
        )
        const hasDomainName = (
          category.domainNames as readonly string[]
        ).includes(targetDomain)
        if (hasDomainId && hasDomainName) {
          return category
        }
        return {
          ...category,
          domainNames: hasDomainName
            ? category.domainNames
            : [...category.domainNames, targetDomain],
          domains: hasDomainId
            ? category.domains
            : [...(category.domains as readonly string[]), commandDomainId],
        }
      }
      // 他のカテゴリからは除く
      if (!targetDomain) {
        return {
          ...category,
          domains: (category.domains as readonly string[]).filter(
            (id) => id !== commandDomainId,
          ),
        }
      }
      return {
        ...category,
        domainNames: (category.domainNames as readonly string[]).filter(
          (name) => name !== targetDomain,
        ),
        domains: (category.domains as readonly string[]).filter(
          (id) => id !== commandDomainId,
        ),
      }
    })

    if (updatedCategories.some((category, index) => category !== all[index])) {
      await deps.parentCategoryRepository.saveAll(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        updatedCategories as readonly ParentCategory[],
      )
    } else {
      // no-op
    }

    if (!targetCategoryId && !targetDomain) {
      throw new SavedTabsDomainError(
        'AssignDomainToCategory: 対象 TabGroup が見つかりません',
        'TAB_GROUP_NOT_FOUND',
      )
    }

    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      all: updatedCategories as readonly ParentCategory[],
      mappings: nextMappings,
    }
  }
}
