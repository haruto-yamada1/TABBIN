/**
 * `SetCategoryKeywordsUseCase` の依存 port。
 *
 * 旧 `src/lib/storage/tabs.setCategoryKeywords` 相当の「`TabGroup` の
 * `categoryKeywords` 更新 + 連動する `DomainCategorySettings` 更新 +
 * `urlSubCategories` 再計算」を 1 操作にまとめた port。
 *
 * なぜ port として抽象化するのか:
 * - 旧 `setCategoryKeywords` は `tabGroup`（rich 補助フィールド持ち）と
 *   `domainCategorySettings`（別 storage key）の 2 箇所を更新し、
 *   さらに `urlSubCategories` を再計算する。`chrome.storage.local`
 *   のトランザクション境界を 1 つにまとめて原子性を確保する既存挙動を
 *   維持する必要がある。
 * - domain `TabGroup` エンティティは rich 補助フィールド
 *   （`categoryKeywords` / `urlSubCategories` など）を持たないため、
 *   `TabGroupRepository.saveAll` 経由の更新では `categoryKeywords` を
 *   書き換える手段がない。port を 1 段噛ませて既存挙動を保全する
 *   （issue #501）。
 *
 * 実装は `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/`
 * 配下に置く。
 */
export type SetCategoryKeywordsPort = {
  /**
   * 旧 `src/lib/storage/tabs.setCategoryKeywords` の port 版。
   *
   * 成功時は `void`。失敗時は各 storage key の書き込みが atomic に
   * 巻き戻される（旧 `persistBulkDeleteForGroup` と同等の保証）。
   */
  setCategoryKeywords: (
    tabGroupId: string,
    categoryName: string,
    keywords: readonly string[],
  ) => Promise<void>
}
