import type { ParentCategory } from '../entities/ParentCategory'
import type { TabGroupId } from '../value-objects/TabGroupId'

/**
 * カテゴリ内ドメイン順序更新の pure domain service (issue #525)。
 *
 * 旧
 * `src/contexts/saved-tabs/presentation/hooks/useCategoryManagement.ts`
 * の `handleUpdateDomainsOrder` 内の
 * - 対象カテゴリの `domains` を UI から渡された順序へ組み替える
 *
 * ロジックを domain 等価物として抽出したもの。
 *
 * UI 側は `TabGroup` 配列を受け取るが、domain 層は永続化対象である
 * `TabGroupId[]` のみを扱う。`TabGroup` -> `TabGroupId` 変換は
 * use-case 側に閉じる。
 *
 * domain 層ガード (React 依存禁止、`chrome.*` 依存禁止、`toast` 依存
 * 禁止、`@dnd-kit/sortable` 依存禁止) を満たすため、副作用・永続化・
 * ロギングは含めず、純粋な配列変換のみを公開する。
 *
 * 旧実装との互換性:
 * - `updatedDomains` (=`command.domainIds`) の順序をそのまま
 *   `domains` に保存する（旧 `handleUpdateDomainsOrder` の
 *   `updatedDomains.map((d) => d.id)` 上書き挙動と一致）。
 * - `domainNames` 経由でのみ表示されるエントリ（`domains` に
 *   存在しないが `domainNames` に存在するもの）も `updatedDomains`
 *   経由で `domains` へ追加される（Codex レビュー対応 / issue #525）。
 *   これにより、UI 並び替え確定時に「`domainNames` だけ残っていた
 *   ドメイン」が explicit な `domains` 順序へ昇格する。
 * - 対象カテゴリが見つからない場合は no-op として現在値を返す。
 */
export interface ReorderDomainsInCategoryParams {
  readonly categories: readonly ParentCategory[]
  /** 並び替え対象カテゴリの `ParentCategoryId`。 */
  readonly categoryId: string
  /**
   * 新しいドメイン順序（`TabGroupId` の配列）。
   *
   * UI 側で並び替えたあとの順序をそのまま保存する。既存 `domains` に
   * 存在しない ID（`domainNames` 経由の表示エントリ等）もそのまま
   * 順序に組み込まれる。
   */
  readonly domainIds: readonly TabGroupId[]
}

export interface ReorderDomainsInCategoryResult {
  readonly targetFound: boolean
  readonly updatedCategories: readonly ParentCategory[]
  readonly domainIdOrder: readonly TabGroupId[]
}

export const reorderDomainsInCategory = (
  params: ReorderDomainsInCategoryParams,
): ReorderDomainsInCategoryResult => {
  const { categories, categoryId, domainIds } = params
  const targetCategory = categories.find(
    (category) => category.id === categoryId,
  )
  if (!targetCategory) {
    return {
      domainIdOrder: [],
      targetFound: false,
      updatedCategories: categories.map((category) => ({ ...category })),
    }
  }
  const updatedCategories = categories.map((category) =>
    category.id === categoryId
      ? { ...category, domains: domainIds }
      : { ...category },
  )
  return {
    domainIdOrder: domainIds,
    targetFound: true,
    updatedCategories,
  }
}
