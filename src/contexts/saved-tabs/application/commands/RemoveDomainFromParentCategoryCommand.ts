import type { TabGroupId } from '../../domain/value-objects/TabGroupId'
import type { DomainName } from '../../domain/value-objects/DomainName'
import type { ParentCategoryId } from '../../domain/value-objects/ParentCategoryId'

/**
 * `RemoveDomainFromParentCategoryCommand` の入力。
 *
 * 親カテゴリの `domains` / `domainNames` から指定の domain を削除する。
 * 対象カテゴリが見つからない / domain が含まれていない場合は use-case 側で
 * 例外を投げる。
 *
 * @example
 * ```ts
 * const command: RemoveDomainFromParentCategoryCommand = {
 *   categoryId: 'cat-docs',
 *   domainId: 'tab-1' as unknown as TabGroupId,
 *   domainName: 'example.com' as unknown as DomainName,
 * }
 * ```
 */
export interface RemoveDomainFromParentCategoryCommand {
  readonly categoryId: ParentCategoryId
  readonly domainId: TabGroupId
  readonly domainName: DomainName
}
