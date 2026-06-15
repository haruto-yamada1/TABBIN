import type { TabGroupId } from '../../domain/value-objects/TabGroupId'
import type { DomainName } from '../../domain/value-objects/DomainName'
import type { ParentCategoryId } from '../../domain/value-objects/ParentCategoryId'

/**
 * `AddDomainToParentCategoryCommand` の入力。
 *
 * 親カテゴリに `TabGroupId` (内部: `domains` 配列) と `DomainName`
 * (内部: `domainNames` 配列) を追加する。
 * 同一 domain が既存カテゴリに含まれていないかの検証は use-case 側で行う。
 *
 * @example
 * ```ts
 * const command: AddDomainToParentCategoryCommand = {
 *   categoryId: 'cat-docs',
 *   domainId: 'tab-1' as unknown as TabGroupId,
 *   domainName: 'example.com' as unknown as DomainName,
 * }
 * ```
 */
export interface AddDomainToParentCategoryCommand {
  readonly categoryId: ParentCategoryId
  readonly domainId: TabGroupId
  readonly domainName: DomainName
}
