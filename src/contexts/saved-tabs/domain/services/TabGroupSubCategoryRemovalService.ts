import type { SubCategoryKeywordDto } from '../dto/DomainCategorySettingsDto'

/**
 * `TabGroup` から「子カテゴリ（subCategory）」を 1 件削除した
 * 状態の `TabGroup` を返すための pure domain service (issue #519)。
 *
 * 旧 `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * 内の `removeSubCategoryFromGroup` を domain 等価物として
 * 抽出したもの。`chrome.storage.local` を知らず、永続化は
 * use-case / repository 側に委ねる。
 *
 * 背景:
 * - ドメイン層 DTO `TabGroupDto` は `urlSubCategories` を含むが、
 *   `subCategories` / `categoryKeywords` は rich な補助フィールド
 *   として DTO 化されていない (`src/contexts/saved-tabs/domain/dto/TabGroupDto.ts`)。
 * - それでも本操作は category 削除の核ロジックなので、domain 層に
 *   置くのが妥当。`@/types/storage` への直接依存を避けるため、
 *   必要フィールドだけを `SubCategoryDeletableTabGroup` interface
 *   で widening して受け取る。
 */
export interface SubCategoryDeletableTabGroup {
  readonly id: string
  /** このドメインで利用可能な子カテゴリ一覧（旧 rich 補助フィールド）。 */
  readonly subCategories?: readonly string[]
  /** 個別 URL に紐づく子カテゴリ名マッピング（旧 rich 補助フィールド）。 */
  readonly urlSubCategories?: Readonly<Record<string, string>>
  /** 子カテゴリのキーワード設定（旧 rich 補助フィールド）。 */
  readonly categoryKeywords?: readonly SubCategoryKeywordDto[]
}

/**
 * `TabGroup` から `categoryName` を 1 件削除した `TabGroup` を返す。
 *
 * - 対象 `group.id` が `groupId` と一致しない場合は入力をそのまま返す
 *   （副作用なし）。
 * - 削除対象が見つからない場合（`subCategories` / `urlSubCategories` /
 *   `categoryKeywords` に存在しない）も入力をそのまま返す。
 * - `subCategories` から該当 name を除外し、`urlSubCategories` の
 *   値が一致するエントリもまとめて削除、`categoryKeywords` からも
 *   該当カテゴリの設定を除外する。
 *
 * 旧 `useCategoryManagement.removeSubCategoryFromGroup` の挙動を
 * そのまま保ったまま domain 層へ移設する (issue #519)。
 *
 * @example
 * ```ts
 * removeSubCategoryFromGroup(
 *   { id: 'g1', subCategories: ['docs', 'news'], urlSubCategories: { 'u1': 'docs' } },
 *   'g1',
 *   'docs',
 * )
 * // => { id: 'g1', subCategories: ['news'], urlSubCategories: {} }
 * ```
 */
export const removeSubCategoryFromGroup = <
  T extends SubCategoryDeletableTabGroup,
>(
  group: T,
  groupId: string,
  categoryName: string,
): T => {
  if (group.id !== groupId) {
    return group
  }
  const nextSubCategories = (group.subCategories ?? []).filter(
    (name) => name !== categoryName,
  )
  const nextUrlSubCategories: Record<string, string> = group.urlSubCategories
    ? { ...group.urlSubCategories }
    : {}
  let urlSubCategoriesChanged = false
  for (const [urlId, name] of Object.entries(nextUrlSubCategories)) {
    if (name === categoryName) {
      // eslint-disable-next-line typescript/no-dynamic-delete
      delete nextUrlSubCategories[urlId]
      urlSubCategoriesChanged = true
    }
  }
  const nextCategoryKeywords = (group.categoryKeywords ?? []).filter(
    (entry) => entry.categoryName !== categoryName,
  )
  const updates: Partial<T> = {}
  if (nextSubCategories.length !== (group.subCategories ?? []).length) {
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    ;(updates as Record<string, unknown>).subCategories = nextSubCategories
  }
  if (urlSubCategoriesChanged) {
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    ;(updates as Record<string, unknown>).urlSubCategories =
      nextUrlSubCategories
  }
  if (nextCategoryKeywords.length !== (group.categoryKeywords ?? []).length) {
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    ;(updates as Record<string, unknown>).categoryKeywords =
      nextCategoryKeywords
  }
  if (Object.keys(updates).length === 0) {
    return group
  }
  return { ...group, ...updates }
}
