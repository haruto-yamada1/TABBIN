import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createCategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import type { CategoryName } from '@/contexts/saved-tabs/domain/value-objects/CategoryName'
import {
  createDomainName,
  normalizeDomainString,
} from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { DomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * 親カテゴリを表すドメインエンティティ。
 *
 * 1 つのカテゴリは、紐づく `TabGroupId` の集合（`domains`）と
 * `DomainName` の集合（`domainNames`）を持つ。前者はストレージ上の
 * `parentCategories[].domains`、後者は同 `domainNames` と対応する。
 *
 * カテゴリ自動判定（URL のドメインと `domainNames` の一致など）は
 * `CategoryAssignmentPolicy` / `TabGroupCategorizationService` に置く。
 *
 * @example
 * ```ts
 * const category = createParentCategory({
 *   id: 'docs',
 *   name: 'Docs',
 *   domains: ['group-1'],
 *   domainNames: ['example.com'],
 * })
 * ```
 */
export interface ParentCategory {
  readonly id: ParentCategoryId
  readonly name: CategoryName
  readonly domains: readonly TabGroupId[]
  readonly domainNames: readonly DomainName[]
}

interface CreateParentCategoryInput {
  id: string
  name: string
  domains: readonly string[]
  domainNames: readonly string[]
}

const assertStringArray = (
  value: unknown,
  field: 'domains' | 'domainNames',
): void => {
  if (!Array.isArray(value)) {
    throw new SavedTabsDomainError(
      `ParentCategory の ${field} は配列で指定してください`,
      'INVALID_PARENT_CATEGORY',
    )
  }
}

/**
 * `ParentCategory` を生成する。
 *
 * `domains` と `domainNames` は重複を許容する既存データと互換するため、
 * 重複検査はしない（重複は service 層で意味付けして扱う）。
 * 空配列は許容する。
 */
export const createParentCategory = (
  input: CreateParentCategoryInput,
): ParentCategory => {
  assertStringArray(input.domains, 'domains')
  assertStringArray(input.domainNames, 'domainNames')
  return {
    id: createParentCategoryId(input.id),
    name: createCategoryName(input.name),
    domains: input.domains.map((domain) => createTabGroupId(domain)),
    // 保存フロー (getTabDomain) が `https://example.com` のようにスキーム付き
    // 文字列を domainNames に書き込む既存データと互換するため、TabGroup.domain
    // と同じく normalizeDomainString で hostname へ正規化してから DomainName 化する。
    // これにより toDomainParentCategories 経由の読み込みで
    // 「ドメイン名にスキームを含めることはできません」エラーを防ぐ。
    domainNames: input.domainNames.map((name) =>
      createDomainName(normalizeDomainString(name)),
    ),
  }
}

/**
 * 2 つの `ParentCategory` を ID で同一視するかを判定する。
 */
export const isSameParentCategory = (
  a: ParentCategory,
  b: ParentCategory,
): boolean => a.id === b.id

/**
 * 指定の `TabGroupId` がこのカテゴリに登録されているかを判定する。
 */
export const parentCategoryContainsTabGroup = (
  category: ParentCategory,
  tabGroupId: TabGroupId,
): boolean => category.domains.includes(tabGroupId)

/**
 * 指定の `DomainName` がこのカテゴリに登録されているかを判定する。
 */
export const parentCategoryContainsDomainName = (
  category: ParentCategory,
  domainName: DomainName,
): boolean => category.domainNames.includes(domainName)

/**
 * ID で `ParentCategory` を検索する。見つからない場合は `undefined`。
 *
 * use-case 側 (RenameParentCategoryUseCase /
 * AddDomainToParentCategoryUseCase / RemoveDomainFromParentCategoryUseCase)
 * の共通ヘルパー。`equalsParentCategoryId` と同じく
 * branded `ParentCategoryId` をキー比較する。
 *
 * @example
 * ```ts
 * const category = parentCategoryById(allCategories, targetId)
 * if (!category) {
 *   throw new SavedTabsDomainError(...)
 * }
 * ```
 */
export const parentCategoryById = (
  categories: readonly ParentCategory[],
  categoryId: ParentCategoryId,
): ParentCategory | undefined =>
  categories.find((category) => category.id === categoryId)
