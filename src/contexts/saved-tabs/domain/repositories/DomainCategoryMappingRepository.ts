import type { DomainCategoryMappingDto } from '@/contexts/saved-tabs/domain/dto/DomainCategoryMappingDto'

/**
 * `DomainCategoryMappingDto` の永続化責務だけを抽出した repository
 * interface。
 *
 * 旧 `src/lib/storage/categories.getDomainCategoryMappings` /
 * `updateDomainCategoryMapping` の DDD 境界。`chrome.storage.local` への
 * 直接アクセスは禁止。実装は
 * `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/` 側に置く。
 *
 * `domain` を主キー、`categoryId` を値とする 1:N 風マッピングを保存する。
 * presentation 層から `@/lib/storage/categories` を import しない
 * 方針 (issue #509) に揃える。
 *
 * `@/types/storage` には依存せず、domain DTO `DomainCategoryMappingDto`
 * だけを返す/受け取る (issue #511)。
 *
 * @example
 * ```ts
 * const mappings = await mappingRepository.findAll()
 * await mappingRepository.saveAll(
 *   mappings.filter((m) => m.domain !== domain)
 * )
 * ```
 */
export interface DomainCategoryMappingRepository {
  findAll: () => Promise<readonly DomainCategoryMappingDto[]>
  saveAll: (mappings: readonly DomainCategoryMappingDto[]) => Promise<void>
}
