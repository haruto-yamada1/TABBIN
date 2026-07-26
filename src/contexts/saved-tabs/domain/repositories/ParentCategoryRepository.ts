import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

/**
 * `ParentCategory` の永続化責務だけを抽出した repository interface。
 *
 * `findAll` / `findById` / `saveAll` / `removeByIds` の 4 操作だけを公開し、
 * ドメインルール（ドメイン-カテゴリ紐付け、`domainNames` の同期など）は
 * `domain/services/CategoryAssignmentPolicy` 側に寄せる。
 *
 * `chrome.storage.local` の直接アクセスは禁止。実装は
 * `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/` 側に置く。
 *
 * @example
 * ```ts
 * const categories = await parentCategoryRepository.findAll()
 * const docs = categories.find((category) => category.name === 'Docs')
 * ```
 */
export type ParentCategoryRepository = {
  findAll: () => Promise<readonly ParentCategory[]>
  findById: (id: ParentCategoryId) => Promise<ParentCategory | null>
  saveAll: (categories: readonly ParentCategory[]) => Promise<void>
  removeByIds: (ids: readonly ParentCategoryId[]) => Promise<void>
}
