import type { ParentCategory } from '../entities/ParentCategory'
import type { TabGroup } from '../entities/TabGroup'
import type { UrlRecord } from '../entities/UrlRecord'
import {
  buildCategoryLookup,
  resolveCategoryForTabGroup,
} from './CategoryAssignmentPolicy'
import type { CategoryLookup } from './CategoryAssignmentPolicy'

/**
 * 検索条件の入力。
 *
 * `query` は前後の空白を許容するが、内部では trim + lowercase した値で比較する。
 * 空クエリは「全件マッチ」として扱う。
 */
export interface SavedTabsSearchInput {
  readonly query: string
}

/**
 * 検索対象になる `TabGroup` の文脈データ。
 *
 * `urls` は `UrlRecord` の参照解決済みリスト。infrastructure 側で
 * `TabGroup.urlIds` → `UrlRecord` への解決を済ませてから渡す前提。
 */
export interface SavedTabsSearchContext {
  readonly group: TabGroup
  readonly urls: readonly UrlRecord[]
}

/**
 * 検索結果。`urls` は元のグループのうちクエリにマッチしたものだけを残す。
 *
 * `categoryMatched` は親カテゴリ名がマッチしたケース（URL は元配列まま）。
 */
export interface SavedTabsSearchResult {
  readonly group: TabGroup
  readonly urls: readonly UrlRecord[]
  readonly categoryMatched: boolean
}

const normalizeQuery = (query: string): string => query.trim().toLowerCase()

const includesQuery = (value: string, query: string): boolean =>
  value.toLowerCase().includes(query)

/**
 * 親カテゴリ名がクエリにマッチするかを判定する pure 関数。
 *
 * `SavedTabsApp.tsx` の `matchesParentCategoryQuery` を domain 等価物にしたもの。
 */
const matchesCategoryQuery = (
  group: TabGroup,
  lookup: CategoryLookup,
  normalizedQuery: string,
): boolean => {
  const category = resolveCategoryForTabGroup(group, lookup)
  if (!category) {
    return false
  }
  return includesQuery(category.name, normalizedQuery)
}

const matchesUrlOrTitleOrDomain = (
  urlRecord: UrlRecord,
  group: TabGroup,
  normalizedQuery: string,
): boolean =>
  includesQuery(urlRecord.title, normalizedQuery) ||
  includesQuery(urlRecord.url, normalizedQuery) ||
  includesQuery(group.domain, normalizedQuery)

/**
 * 保存タブ検索の本体。
 *
 * `query` を URL / title / domain / category 名に対して部分一致で評価し、
 * カテゴリ名マッチの場合はグループ全体を返す、それ以外は URL 単位で絞り込む。
 *
 * @example
 * ```ts
 * searchSavedTabs({
 *   input: { query: 'react' },
 *   contexts,
 *   categories,
 * })
 * ```
 */
export const searchSavedTabs = ({
  input,
  contexts,
  categories,
}: {
  input: SavedTabsSearchInput
  contexts: readonly SavedTabsSearchContext[]
  categories: readonly ParentCategory[]
}): SavedTabsSearchResult[] => {
  const normalizedQuery = normalizeQuery(input.query)
  if (normalizedQuery.length === 0) {
    return contexts.map((context) => ({
      group: context.group,
      urls: context.urls,
      categoryMatched: false,
    }))
  }
  const lookup = buildCategoryLookup(categories)
  const results: SavedTabsSearchResult[] = []
  for (const context of contexts) {
    const categoryMatched = matchesCategoryQuery(
      context.group,
      lookup,
      normalizedQuery,
    )
    if (categoryMatched) {
      results.push({
        group: context.group,
        urls: context.urls,
        categoryMatched: true,
      })
      continue
    }
    const filteredUrls = context.urls.filter((urlRecord) =>
      matchesUrlOrTitleOrDomain(urlRecord, context.group, normalizedQuery),
    )
    if (filteredUrls.length === 0) {
      continue
    }
    results.push({
      group: context.group,
      urls: filteredUrls,
      categoryMatched: false,
    })
  }
  return results
}
