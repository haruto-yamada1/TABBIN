import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

/**
 * `RenameParentCategoryCommand` の入力。
 *
 * 親カテゴリ (ParentCategory) の `name` を更新する最小単位の入力。
 * ビジネスロジック (重複検知、`domainNames` / `domains` の保持) は
 * use-case 側で処理する。
 *
 * `newName` は trim 済みの素の文字列。空文字やトリム処理の判断は
 * use-case 側で行う。
 *
 * @example
 * ```ts
 * const command: RenameParentCategoryCommand = {
 *   categoryId: 'cat-docs',
 *   newName: 'ドキュメント',
 * }
 * ```
 */
export interface RenameParentCategoryCommand {
  readonly categoryId: ParentCategoryId
  readonly newName: string
}
