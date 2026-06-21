import type { SavedTabRawSummaryDto } from '@/contexts/saved-tabs/domain/dto/SavedTabRawSummaryDto'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

/**
 * `TabGroup` の永続化責務だけを抽出した repository interface。
 *
 * `src/contexts/saved-tabs/domain/repositories/` 配下に interface のみを置き、
 * 実装（`chrome.storage.local` / IndexedDB / メモリなど）は
 * `src/contexts/saved-tabs/infrastructure/persistence/` 側で提供する。
 *
 * ルール:
 * - この interface は `chrome.*` API を知らない。
 * - `findAll` / `findById` / `saveAll` / `removeByIds` の 4 操作だけを公開し、
 *   ビジネスロジック（URL 追加、並び替え、サブカテゴリ付けなど）は
 *   use-case / domain service 側に寄せる。
 * - 返り値は `readonly` 修飾し、取得側で破壊的変更を許さない。
 *
 * @example
 * ```ts
 * const groups = await tabGroupRepository.findAll()
 * const target = groups.find((group) => group.domain === 'example.com')
 * ```
 */
export interface TabGroupRepository {
  findAll: () => Promise<readonly TabGroup[]>
  findById: (id: TabGroupId) => Promise<TabGroup | null>
  saveAll: (groups: readonly TabGroup[]) => Promise<void>
  removeByIds: (ids: readonly TabGroupId[]) => Promise<void>
  /**
   * 永続化層に保存されている「そのままの domain 文字列」を取得する。
   *
   * entity 化された `TabGroup.domain` は `DomainName` ブランドを通す
   * 過程で hostname 形式に正規化される。一方、storage には
   * 旧来の schemeful 形式（例: `https://example.com`）が残っている
   * ケースがあり、`domainCategoryMappings` /
   * `parentCategory.domainNames` の lookup キーは依然として
   * schemeful 形式を期待する。
   *
   * このメソッドは presentation / use-case 層が
   * 「storage に書かれている domain 文字列そのもの」を必要とする
   * ケース（主に schemeful 形式 lookup との一致）にだけ使う。
   * 通常の entity 比較は `findById` の `domain` を使う。
   *
   * 見つからない場合は `null` を返す。
   */
  findRawDomainById: (id: TabGroupId) => Promise<string | null>
  /**
   * storage 形 (`SavedTabRaw` 由来) の rich 補助フィールドを
   * `SavedTabRawSummaryDto` として ID で 1 件取得する。
   *
   * domain entity `TabGroup` には載らない `subCategories` /
   * `categoryKeywords` / 旧 `urls` / `urlSubCategories` /
   * `subCategoryOrder` などのうち、削除前処理 use-case
   * (`PrepareTabGroupDeletionUseCase`, issue #524) で必要になる
   * `subCategories` / `categoryKeywords` / `parentCategoryId` /
   * `domain` を DTO として返す。
   *
   * 通常の entity 比較は `findById` の戻り値 (`TabGroup` entity)
   * を使い、storage の生文字列 domain を必要とするケースは
   * `findRawDomainById` を使う。本メソッドは
   * 「entity には載らないが application 層から storage に
   * アクセスしたい rich フィールド」のための補助 API。
   *
   * 見つからない場合は `null` を返す。
   */
  findRawTabGroupById: (id: TabGroupId) => Promise<SavedTabRawSummaryDto | null>
}
