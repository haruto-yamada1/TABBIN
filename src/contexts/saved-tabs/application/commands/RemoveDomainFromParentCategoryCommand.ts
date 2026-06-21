import type { DomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

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
