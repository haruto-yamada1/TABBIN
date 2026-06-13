import type { DomainName } from '../../domain/value-objects/DomainName'
import type { ParentCategoryId } from '../../domain/value-objects/ParentCategoryId'

/**
 * `MoveDomainToCategoryCommand` の入力。
 *
 * 特定ドメイン（例: `example.com`）を任意の `ParentCategory` に紐付ける
 * 操作。`TabGroup.parentCategoryId` / `ParentCategory.domainNames` の
 * 同期は use-case 内で行う。
 *
 * `domain` と `parentCategoryId` の整合性検証は use-case 側で行う
 * （`parentCategoryRepository.findById` で存在確認）。
 *
 * @example
 * ```ts
 * const command: MoveDomainToCategoryCommand = {
 *   domain: 'example.com',
 *   parentCategoryId: 'cat-docs',
 * }
 * ```
 */
export interface MoveDomainToCategoryCommand {
  readonly domain: DomainName
  readonly parentCategoryId: ParentCategoryId
}
