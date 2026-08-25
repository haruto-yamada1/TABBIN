import { describe, expect, it } from 'vitest'

import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import {
  categorizeTabGroups,
  sortGroupsByCategoryDomainOrder,
  UNCATEGORIZED_KEY,
} from './TabGroupCategorizationService'

const docs = createParentCategory({
  id: 'docs',
  name: 'Docs',
  collections: [
    { id: 'group-docs-1', domain: 'docs1.example.com' },
    { id: 'group-docs-2', domain: 'docs2.example.com' },
  ],
})

const news = createParentCategory({
  id: 'news',
  name: 'News',
  collections: [{ id: 'group-news', domain: 'news.example.com' }],
})

const docsGroup1 = createTabGroup({
  id: 'group-docs-1',
  domain: 'docs1.example.com',
  memberships: [].map((urlId) => ({ urlId })),
})
const docsGroup2 = createTabGroup({
  id: 'group-docs-2',
  domain: 'docs2.example.com',
  memberships: [].map((urlId) => ({ urlId })),
})
const newsGroup = createTabGroup({
  id: 'group-news',
  domain: 'news.example.com',
  memberships: [].map((urlId) => ({ urlId })),
})
const uncategorizedGroup = createTabGroup({
  id: 'group-misc',
  domain: 'misc.example.com',
  memberships: [].map((urlId) => ({ urlId })),
})

describe('TabGroupCategorizationService.categorizeTabGroups', () => {
  it('カテゴリ別に振り分け、未分類を末尾にまとめる', () => {
    const result = categorizeTabGroups({
      groups: [newsGroup, docsGroup1, uncategorizedGroup, docsGroup2],
      categories: [docs, news],
    })
    expect(result).toHaveLength(3)
    expect(result[0]?.key).toBe('docs')
    expect(result[0]?.groups.map((group) => group.id)).toStrictEqual([
      'group-docs-1',
      'group-docs-2',
    ])
    expect(result[1]?.key).toBe('news')
    expect(result[1]?.groups.map((group) => group.id)).toStrictEqual([
      'group-news',
    ])
    expect(result[2]?.key).toBe(UNCATEGORIZED_KEY)
    expect(result[2]?.groups.map((group) => group.id)).toStrictEqual([
      'group-misc',
    ])
  })

  it('未分類が存在しなければ末尾にバケットを作らない', () => {
    const result = categorizeTabGroups({
      groups: [docsGroup1, newsGroup],
      categories: [docs, news],
    })
    expect(result.map((bucket) => bucket.key)).toStrictEqual(['docs', 'news'])
  })

  it('すべて未分類なら UNCATEGORIZED_KEY のみを返す', () => {
    const result = categorizeTabGroups({
      groups: [uncategorizedGroup],
      categories: [docs, news],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.key).toBe(UNCATEGORIZED_KEY)
  })
})

describe('TabGroupCategorizationService.sortGroupsByCategoryDomainOrder', () => {
  it('domains の順序に合わせて並べ替える', () => {
    const sorted = sortGroupsByCategoryDomainOrder(
      [docsGroup2, docsGroup1],
      docs,
    )
    expect(sorted.map((group) => group.id)).toStrictEqual([
      'group-docs-1',
      'group-docs-2',
    ])
  })

  it('domains にない id は末尾に回し、相対順序は維持する', () => {
    const extra = createTabGroup({
      id: 'group-extra',
      domain: 'extra.example.com',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const sorted = sortGroupsByCategoryDomainOrder(
      [extra, docsGroup2, docsGroup1],
      docs,
    )
    expect(sorted.map((group) => group.id)).toStrictEqual([
      'group-docs-1',
      'group-docs-2',
      'group-extra',
    ])
  })

  it('domains が空のカテゴリでは入力順をそのまま返す', () => {
    const sorted = sortGroupsByCategoryDomainOrder([docsGroup2, docsGroup1], {
      ...docs,
      collections: [],
    })
    expect(sorted.map((group) => group.id)).toStrictEqual([
      'group-docs-2',
      'group-docs-1',
    ])
  })
})
