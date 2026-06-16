import { describe, expect, it } from 'vitest'

import { createParentCategory } from '../entities/ParentCategory'
import { createTabGroupId } from '../value-objects/TabGroupId'
import { reorderDomainsInCategory } from './CategoryDomainOrderingService'

const buildDocs = () =>
  createParentCategory({
    domainNames: ['example.com', 'docs.com', 'extra.com'],
    domains: ['tab-1', 'tab-2', 'tab-3'],
    id: 'cat-docs',
    name: 'Docs',
  })

describe('reorderDomainsInCategory', () => {
  it('新しい順序で domains を組み替える', () => {
    const result = reorderDomainsInCategory({
      categories: [buildDocs()],
      categoryId: 'cat-docs',
      domainIds: [createTabGroupId('tab-3'), createTabGroupId('tab-1')],
    })
    expect(result.targetFound).toBe(true)
    expect(result.domainIdOrder).toStrictEqual(['tab-3', 'tab-1', 'tab-2'])
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    expect(docs?.domains).toStrictEqual(['tab-3', 'tab-1', 'tab-2'])
  })

  it('domainIds に存在しない既存 ID は末尾に保持される', () => {
    const result = reorderDomainsInCategory({
      categories: [buildDocs()],
      categoryId: 'cat-docs',
      domainIds: [createTabGroupId('tab-3')],
    })
    expect(result.domainIdOrder).toStrictEqual(['tab-3', 'tab-1', 'tab-2'])
  })

  it('domainIds が空の場合、既存順序をそのまま返す', () => {
    const result = reorderDomainsInCategory({
      categories: [buildDocs()],
      categoryId: 'cat-docs',
      domainIds: [],
    })
    expect(result.domainIdOrder).toStrictEqual(['tab-1', 'tab-2', 'tab-3'])
  })

  it('対象カテゴリが見つからない場合は targetFound=false', () => {
    const categories = [buildDocs()]
    const result = reorderDomainsInCategory({
      categories,
      categoryId: 'cat-missing',
      domainIds: [createTabGroupId('tab-1')],
    })
    expect(result.targetFound).toBe(false)
    expect(result.domainIdOrder).toStrictEqual([])
    expect(result.updatedCategories[0]?.domains).toStrictEqual([
      'tab-1',
      'tab-2',
      'tab-3',
    ])
  })

  it('入力配列を破壊しない', () => {
    const categories = [buildDocs()]
    const before = categories[0]?.domains.slice()
    reorderDomainsInCategory({
      categories,
      categoryId: 'cat-docs',
      domainIds: [createTabGroupId('tab-3')],
    })
    expect(categories[0]?.domains).toStrictEqual(before)
  })

  it('他カテゴリの domains は影響を受けない', () => {
    const news = createParentCategory({
      domainNames: ['news.com'],
      domains: ['tab-99'],
      id: 'cat-news',
      name: 'News',
    })
    const result = reorderDomainsInCategory({
      categories: [buildDocs(), news],
      categoryId: 'cat-docs',
      domainIds: [createTabGroupId('tab-3'), createTabGroupId('tab-2')],
    })
    const updatedNews = result.updatedCategories.find(
      (c) => c.id === 'cat-news',
    )
    expect(updatedNews?.domains).toStrictEqual(['tab-99'])
  })
})
