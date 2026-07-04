/**
 * `saved-tabs` 機能の保存データ形式移行 (migration) を
 * `infrastructure` 層に閉じ込めた port。
 *
 * 旧 `src/lib/storage/migration.migrateToUrlsStorage` /
 * `migrateParentCategoriesToDomainNames` を DDD の `application` 層 /
 * presentation 層から直接呼ばないようにするための抽象。
 *
 * 実装は `infrastructure/persistence/chrome-storage/ChromeMigrationAdapter`
 * 側に置く。テストでは in-memory adapter を注入できる。
 */
export interface MigrationPort {
  /**
   * `urls` 形式へのマイグレーションを冪等に実行する。`urlsMigrationCompleted`
   * フラグを見て未実行なら storage データを更新する。
   */
  migrateToUrlsStorage: () => Promise<void>

  /**
   * `parentCategories[].domainNames` を `savedTabs` /
   * `domainCategoryMappings` から再構築して storage に保存する。
   * 緊急マイグレーション用途 (旧 data 形式と新 data 形式の互換維持)。
   */
  migrateParentCategoriesToDomainNames: () => Promise<void>

  /**
   * スキーム付きドメイン (`https://example.com`) を hostname (`example.com`)
   * へ正規化し、`savedTabs` / `parentCategories` / `domainCategorySettings` /
   * `domainCategoryMappings` のドメイン値を hostname 形式へ冪等に統一する
   * (Finding B の根本治療)。完了フラグ `domainHostnameMigrationCompleted` で
   * 再実行を抑制する。
   */
  migrateDomainStorageToHostname: () => Promise<void>
}
