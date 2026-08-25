/**
 * presentation 層で扱う `TabGroup` の view-model。
 *
 * domain `TabGroup` entity を UI 描画に必要な形に丸めた読み取り専用モデル。
 * 既存の `src/features/saved-tabs/components/*` が要求する形と互換に保ち、
 * コンポーネントへそのまま props として渡せることを目標にする。
 *
 * - `id` / `domain` は domain `TabGroup`、`urls` は解決済み表示データ。
 * - `parentCategoryId` は未分類時に `undefined`。
 * - `displayUrlCount` は 0 のとき空カード／非表示判定に利用する。
 * - `subCategoryCount` は CategoryModal / CategoryGroup で「カテゴリ N 件」を
 *   表示するための派生値。
 */
export type TabGroupViewModel = {
  readonly id: string
  readonly domain: string
  readonly parentCategoryId: string | undefined
  readonly urls: readonly {
    readonly id?: string
    readonly url: string
    readonly title: string
    readonly subCategory?: string
  }[]
  readonly displayUrlCount: number
  readonly subCategoryCount: number
  readonly hasUrls: boolean
}

/**
 * domain `TabGroup` を view-model へ変換する純関数。
 *
 * presentation 層に閉じ、application 層では呼び出さない。
 * repository / use-case が返した entity 配列を `SavedTabsController` が
 * まとめてこの関数に通し、コンポーネントへ渡す。
 *
 * branded な `TabGroupId` / `UrlRecordId` を含む entity を受け取れるよう
 * 配列は `readonly` 許容にしている。presentation 層で branded 型を意識
 * せず `readonly` として扱える。
 */
export const toTabGroupViewModel = (group: {
  id: string
  domain: string
  parentCategoryId?: string
  memberships?: readonly { urlId: string }[]
  urls?: readonly {
    id?: string
    url: string
    title: string
    subCategory?: string
  }[]
  subCategories?: readonly string[]
}): TabGroupViewModel => {
  const urls = group.urls ?? []
  const subCategories = group.subCategories ?? []
  const displayUrlCount =
    urls.length > 0 ? urls.length : (group.memberships?.length ?? 0)
  return {
    displayUrlCount,
    domain: group.domain,
    hasUrls: displayUrlCount > 0,
    id: group.id,
    parentCategoryId: group.parentCategoryId,
    subCategoryCount: subCategories.length,
    urls: [...urls],
  }
}
