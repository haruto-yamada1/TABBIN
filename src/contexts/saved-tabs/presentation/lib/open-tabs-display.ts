/** 「今開いているタブ」行の categoryContext (data-category-context 属性値)。 */
export const OPEN_TABS_CATEGORY_CONTEXT = 'open-tabs'

/** 行候補のソース。domain の TabGroup / custom の CustomProject 両対応。 */
export type OpenTabsDisplaySource = {
  id: string
  urls?: readonly {
    isFavorite?: boolean
    savedAt?: number
    title: string
    url: string
  }[]
}

/** 「今開いているタブ」セクションの 1 行。タブグループ内の保存 URL 出現単位。 */
export type OpenTabsRow = {
  readonly groupId: string
  readonly id: string
  readonly isFavorite: boolean
  readonly savedAt?: number
  readonly title: string
  readonly url: string
}

/** 同一 reuse の URL が複数グループに属しても dnd-kit id が衝突しない複合識別子。 */
export const buildOpenTabsRowId = (groupId: string, url: string): string =>
  `${groupId}\u0000${url}`

const EMPTY_OPEN_TABS_ROWS: readonly OpenTabsRow[] = []

/**
 * 保存タブ全体から「現在ブラウザで開いている」出現だけを
 * `OpenSavedTabsPort.getOpenUrlsSnapshot()` の exact URL set で絞り込む
 * 純関数。URL マッチの厳密さは既存の `useOpenSavedTab(url)` と同じ
 * exact 文字列比較に揃える。domain の TabGroup と custom の CustomProject
 * 両方をソースにできる。
 */
export const buildOpenTabsRows = (
  groups: readonly OpenTabsDisplaySource[],
  openUrls: readonly string[],
): readonly OpenTabsRow[] => {
  if (openUrls.length === 0) {
    return EMPTY_OPEN_TABS_ROWS
  }
  const openUrlSet = new Set(openUrls)
  const rows: OpenTabsRow[] = []
  for (const group of groups) {
    for (const item of group.urls ?? []) {
      if (!openUrlSet.has(item.url)) {
        continue
      }
      rows.push({
        url: item.url,
        title: item.title,
        id: buildOpenTabsRowId(group.id, item.url),
        groupId: group.id,
        isFavorite: item.isFavorite ?? false,
        ...(item.savedAt !== undefined ? { savedAt: item.savedAt } : {}),
      })
    }
  }
  return rows
}

/**
 * 監視中の open set はユーザー操作・ページ遷移で常時変化するため、
 * ドラッグによる並び替え順はセッション内の表示順に限り永続化しない。
 * 不足 id は復活させず、未知 id は末尾に追記する。
 */
export const applyOpenTabsRowOrder = (
  rows: readonly OpenTabsRow[],
  rowOrder: readonly string[],
): readonly OpenTabsRow[] => {
  if (rowOrder.length === 0) {
    return rows
  }
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const ordered: OpenTabsRow[] = []
  const seen = new Set<string>()
  for (const id of rowOrder) {
    const row = rowById.get(id)
    if (!row || seen.has(id)) {
      continue
    }
    ordered.push(row)
    seen.add(id)
  }
  for (const row of rows) {
    if (!seen.has(row.id)) {
      ordered.push(row)
    }
  }
  return ordered
}
