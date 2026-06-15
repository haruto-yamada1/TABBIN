import type { DomainCategorySettings } from '@/types/storage'

/**
 * `DomainCategorySettings` の永続化責務だけを抽出した repository interface。
 *
 * 旧 `src/lib/storage/categories.getDomainCategorySettings` /
 * `updateDomainCategorySettings` の DDD 境界。`chrome.storage.local` への
 * 直接アクセスは禁止。実装は
 * `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/` 側に置く。
 *
 * `domain` を主キーとしたドメイン別の子カテゴリ / キーワード設定を保存する。
 * `TabGroup.subCategories` / `TabGroup.categoryKeywords` と並列に
 * 保持され、削除時復元などで参照される。
 *
 * presentation 層から `@/lib/storage/categories` を import しない
 * 方針 (issue #509) に揃える。
 *
 * @example
 * ```ts
 * const settings = await settingsRepository.findAll()
 * await settingsRepository.saveAll(
 *   settings.map((s) =>
 *     s.domain === domain ? { ...s, subCategories } : s,
 *   ),
 * )
 * ```
 */
export interface DomainCategorySettingsRepository {
  findAll: () => Promise<readonly DomainCategorySettings[]>
  saveAll: (settings: readonly DomainCategorySettings[]) => Promise<void>
}
