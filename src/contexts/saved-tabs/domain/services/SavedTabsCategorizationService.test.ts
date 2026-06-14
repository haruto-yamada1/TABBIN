import { describe, expect, it } from 'vitest'

import type { ParentCategory, TabGroup } from '@/types/storage'

import {
  buildPresentationCategoryLookup,
  organizeTabGroupsWithCategories,
} from './SavedTabsCategorizationService'

const docsCategory: ParentCategory = {
  domainNames: ['docs.example.com'],
  domains: ['group-docs-1', 'group-docs-2'],
  id: 'docs',
  name: 'Docs',
}
const newsCategory: ParentCategory = {
  domainNames: ['news.example.com'],
  domains: [],
  id: 'news',
  name: 'News',
}

const makeGroup = (overrides: Partial<TabGroup> = {}): TabGroup => ({
  domain: 'example.com',
  id: 'group-1',
  urlIds: ['url-1'],
  ...overrides,
})

describe('SavedTabsCategorizationService.buildPresentationCategoryLookup', () => {
  it('byId / byGroupId / byDomainName の各キーで引ける', () => {
    const lookup = buildPresentationCategoryLookup([docsCategory, newsCategory])
    expect(lookup.byId.get('docs')).toStrictEqual(docsCategory)
    expect(lookup.byGroupId.get('group-docs-1')).toStrictEqual(docsCategory)
    expect(lookup.byDomainName.get('news.example.com')).toStrictEqual(
      newsCategory,
    )
  })

  it('同一 id / domainName を複数カテゴリが宣言したら先勝ちで保持する', () => {
    const conflicting: ParentCategory = {
      domainNames: ['docs.example.com'],
      domains: ['group-docs-1'],
      id: 'docs-conflict',
      name: 'Docs Conflict',
    }
    const lookup = buildPresentationCategoryLookup([docsCategory, conflicting])
    expect(lookup.byGroupId.get('group-docs-1')?.id).toBe('docs')
    expect(lookup.byDomainName.get('docs.example.com')?.id).toBe('docs')
  })

  it('空配列を渡しても例外を出さない', () => {
    const lookup = buildPresentationCategoryLookup([])
    expect(lookup.byId.size).toBe(0)
    expect(lookup.byGroupId.size).toBe(0)
    expect(lookup.byDomainName.size).toBe(0)
  })
})

describe('SavedTabsCategorizationService.organizeTabGroupsWithCategories', () => {
  const lookup = buildPresentationCategoryLookup([docsCategory, newsCategory])

  it('ID 一致でカテゴリ分類される (parentCategoryId 単独では分類されない既存挙動)', () => {
    // 旧 `organizeTabGroupsWithCategories` では `tryCategorizeById` /
    // `tryCategorizeByDomainName` の判定で `parentCategoryId` を直接使わず、
    // `byGroupId` / `byDomainName` の lookup ヒットのみで分類する。
    // parentCategoryId がカテゴリ ID と一致していても、lookup に登録が無ければ
    // 未分類になる既存挙動を保つ (issue #496: 既存表示を変えない)。
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({
          domain: 'docs1.example.com',
          id: 'group-docs-1',
        }),
        makeGroup({
          domain: 'other.example.com',
          id: 'group-other',
          parentCategoryId: 'docs',
        }),
      ],
    })
    expect(result.categorized.docs?.map((g) => g.id)).toStrictEqual([
      'group-docs-1',
    ])
    expect(result.uncategorized.map((g) => g.id)).toStrictEqual(['group-other'])
  })

  it('lookup.byGroupId で見つかるグループはドメイン名より優先される', () => {
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({
          domain: 'news.example.com',
          id: 'group-docs-1',
        }),
      ],
    })
    // docs カテゴリに group-docs-1 が登録されているため、docs に分類される
    expect(result.categorized.docs?.map((g) => g.id)).toStrictEqual([
      'group-docs-1',
    ])
    expect(result.categorized.news).toBeUndefined()
  })

  it('ドメイン名一致でカテゴリ分類される', () => {
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({ domain: 'news.example.com', id: 'group-news' }),
      ],
    })
    expect(result.categorized.news?.map((g) => g.id)).toStrictEqual([
      'group-news',
    ])
  })

  it('該当カテゴリがないものは未分類へ入る', () => {
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({ domain: 'misc.example.com', id: 'group-misc' }),
      ],
    })
    expect(result.uncategorized.map((g) => g.id)).toStrictEqual(['group-misc'])
    expect(Object.keys(result.categorized)).toHaveLength(0)
  })

  it('表示可能 URL がないグループは表示対象から除外される', () => {
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({
          domain: 'news.example.com',
          id: 'group-empty',
          urlIds: [],
        }),
        makeGroup({ domain: 'news.example.com', id: 'group-news' }),
      ],
    })
    expect(result.categorized.news?.map((g) => g.id)).toStrictEqual([
      'group-news',
    ])
    expect(result.uncategorized).toHaveLength(0)
  })

  it('enableCategories=false なら categorized は空、uncategorized は入力のまま', () => {
    const groups = [
      makeGroup({ domain: 'news.example.com', id: 'group-news' }),
      makeGroup({ domain: 'misc.example.com', id: 'group-misc' }),
    ]
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: false,
      tabGroupsWithUrls: groups,
    })
    expect(result.categorized).toStrictEqual({})
    expect(result.uncategorized).toStrictEqual(groups)
  })

  it('カテゴリ内の groups は ParentCategory.domains 順で並ぶ', () => {
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({ domain: 'docs2.example.com', id: 'group-docs-2' }),
        makeGroup({ domain: 'docs1.example.com', id: 'group-docs-1' }),
      ],
    })
    expect(result.categorized.docs?.map((g) => g.id)).toStrictEqual([
      'group-docs-1',
      'group-docs-2',
    ])
  })

  it('domains に登録された id は domains 順に並ぶ (登録外 id は未分類へ)', () => {
    // 旧 `sortCategorizedGroups` では `domains` に含まれない id は
    // 末尾へ送られるが、その id が `byDomainName` で他カテゴリに解決
    // されない場合は categorized から外れて uncategorized へ落ちる
    // 既存挙動を保持する (issue #496: 既存表示を変えない)。
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({ domain: 'docs1.example.com', id: 'group-docs-1' }),
        makeGroup({ domain: 'docs-extra.example.com', id: 'group-extra' }),
        makeGroup({ domain: 'docs2.example.com', id: 'group-docs-2' }),
      ],
    })
    expect(result.categorized.docs?.map((g) => g.id)).toStrictEqual([
      'group-docs-1',
      'group-docs-2',
    ])
    expect(result.uncategorized.map((g) => g.id)).toStrictEqual(['group-extra'])
  })

  it('searchQuery が指定されたときは urls を持つグループの URL を絞り込んでカテゴリ分類する', () => {
    // 旧 `filterGroupByQuery` と同じく urls フィールドが無いグループは
    // 絞り込めない既存挙動を保つ。urlIds のみでも hasDisplayableUrls は
    // true のままだが、urls が空配列になったグループは categorizing される
    // (urlIds 側の存在で displayable と判定される既存挙動を保持)。
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      searchQuery: 'react',
      tabGroupsWithUrls: [
        makeGroup({
          domain: 'docs1.example.com',
          id: 'group-docs-1',
          urls: [
            { title: 'React 入門', url: 'https://docs.example.com/react' },
            { title: 'Vue 入門', url: 'https://docs.example.com/vue' },
          ],
        }),
        makeGroup({
          domain: 'docs2.example.com',
          id: 'group-docs-2',
          urls: [{ title: 'Angular 入門', url: 'https://docs.example.com/ng' }],
        }),
      ],
    })
    expect(result.categorized.docs).toHaveLength(2)
    const group1 = result.categorized.docs?.find((g) => g.id === 'group-docs-1')
    const group2 = result.categorized.docs?.find((g) => g.id === 'group-docs-2')
    expect(group1?.urls).toHaveLength(1)
    expect(group1?.urls?.[0]?.title).toBe('React 入門')
    // group-docs-2 は urls が全件フィルタで消えるが urlIds があり
    // hasDisplayableUrls=true なので categorized に残る (既存挙動)。
    expect(group2?.urls).toHaveLength(0)
  })

  it('searchQuery が何にもマッチしない urls を持つグループは categorizing から除外される', () => {
    // urls を持つグループで `currentUrls.length === 0` の early-return は
    // 適用されないので、`filterGroupByQuery` が全件を削り `urls` が空に
    // なる。urlIds を持たないグループは urls が空になる = displayable false
    // となり categorizing から除外される (既存挙動)。
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      searchQuery: 'nomatch',
      tabGroupsWithUrls: [
        makeGroup({
          domain: 'news.example.com',
          id: 'group-news',
          urlIds: [],
          urls: [{ title: 'Other', url: 'https://other.example.com' }],
        }),
      ],
    })
    expect(result.categorized.news).toBeUndefined()
    expect(result.uncategorized).toHaveLength(0)
  })

  it('空配列を渡しても例外を出さない', () => {
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [],
    })
    expect(result.categorized).toStrictEqual({})
    expect(result.uncategorized).toStrictEqual([])
  })

  it('空 categories を渡しても全グループが未分類になる', () => {
    const emptyLookup = buildPresentationCategoryLookup([])
    const result = organizeTabGroupsWithCategories({
      categoryLookup: emptyLookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({ domain: 'news.example.com', id: 'group-news' }),
      ],
    })
    expect(result.uncategorized.map((g) => g.id)).toStrictEqual(['group-news'])
    expect(Object.keys(result.categorized)).toHaveLength(0)
  })

  it('ドメイン名一致で分類された結果は parentCategoryId が categoryId に上書きされる', () => {
    // 旧 `pushGroupToCategory`: `group.parentCategoryId === categoryId`
    // なら group をそのまま、そうでなければ parentCategoryId を
    // categoryId に上書きした group を push する。
    // 入力 group の parentCategoryId と lookup 解決 categoryId が一致
    // する場合は元の parentCategoryId が維持される既存挙動。
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({
          domain: 'news.example.com',
          id: 'group-other',
          parentCategoryId: 'news',
        }),
      ],
    })
    expect(result.categorized.news?.[0]?.parentCategoryId).toBe('news')
  })

  it('URL 件数やカテゴリ件数が既存表示と同じになる (混合パターン)', () => {
    const result = organizeTabGroupsWithCategories({
      categoryLookup: lookup,
      enableCategories: true,
      tabGroupsWithUrls: [
        makeGroup({ domain: 'docs1.example.com', id: 'group-docs-1' }),
        makeGroup({ domain: 'docs2.example.com', id: 'group-docs-2' }),
        makeGroup({ domain: 'news.example.com', id: 'group-news' }),
        makeGroup({ domain: 'misc.example.com', id: 'group-misc' }),
        makeGroup({
          domain: 'empty.example.com',
          id: 'group-empty',
          urlIds: [],
        }),
      ],
    })
    const totalCategorized = Object.values(result.categorized).reduce(
      (sum, groups) => sum + groups.length,
      0,
    )
    expect(totalCategorized + result.uncategorized.length).toBe(4)
    expect(totalCategorized).toBe(3)
    expect(result.uncategorized.map((g) => g.id)).toStrictEqual(['group-misc'])
  })
})
