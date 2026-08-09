import { describe, expect, it } from 'vitest'

import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

import { reorderDomainsInCategory } from './CategoryDomainOrderingService'

const collection = (id: string, domain = `${id}.example.com`) => ({
  domain: createDomainName(domain),
  id: createTabGroupId(id),
})

const buildDocs = () =>
  createParentCategory({
    collections: ['tab-1', 'tab-2', 'tab-3'].map((id, index) => ({
      id,
      domain: ['example.com', 'docs.com', 'extra.com'][index] ?? id,
    })),
    id: 'cat-docs',
    name: 'Docs',
  })

describe('reorderDomainsInCategory', () => {
  it('新しい順序で domains を組み替える', () => {
    const result = reorderDomainsInCategory({
      categories: [buildDocs()],
      categoryId: 'cat-docs',
      collections: [
        collection('tab-3', 'extra.com'),
        collection('tab-1', 'example.com'),
      ],
    })
    expect(result.targetFound).toBe(true)
    expect(result.domainIdOrder).toStrictEqual(['tab-3', 'tab-1'])
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    expect(docs?.collections.map(({ id }) => id)).toStrictEqual([
      'tab-3',
      'tab-1',
    ])
  })

  it('既存 domainIds にない ID もそのまま保存する (Codex レビュー対応 / issue #525)', () => {
    // `domainNames` 経由でのみ表示されるエントリが `updatedDomains` に
    // 含まれているケース。旧 `handleUpdateDomainsOrder` の挙動と一致
    // させ、 `targetCategory.collections.map(({ id }) => id)` に存在しない ID も保存する。
    const result = reorderDomainsInCategory({
      categories: [buildDocs()],
      categoryId: 'cat-docs',
      collections: [collection('tab-new', 'new.com')],
    })
    expect(result.domainIdOrder).toStrictEqual(['tab-new'])
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    expect(docs?.collections).toStrictEqual([
      { domain: 'new.com', id: 'tab-new' },
    ])
  })

  it('domainIds が空の場合、domains も空になる (旧挙動と一致)', () => {
    const result = reorderDomainsInCategory({
      categories: [buildDocs()],
      categoryId: 'cat-docs',
      collections: [],
    })
    expect(result.domainIdOrder).toStrictEqual([])
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    expect(docs?.collections.map(({ id }) => id)).toStrictEqual([])
  })

  it('対象カテゴリが見つからない場合は targetFound=false', () => {
    const categories = [buildDocs()]
    const result = reorderDomainsInCategory({
      categories,
      categoryId: 'cat-missing',
      collections: [collection('tab-1', 'example.com')],
    })
    expect(result.targetFound).toBe(false)
    expect(result.domainIdOrder).toStrictEqual([])
    expect(
      result.updatedCategories[0]?.collections.map(({ id }) => id),
    ).toStrictEqual(['tab-1', 'tab-2', 'tab-3'])
  })

  it('入力配列を破壊しない', () => {
    const categories = [buildDocs()]
    const before = categories[0]?.collections.map(({ id }) => id).slice()
    reorderDomainsInCategory({
      categories,
      categoryId: 'cat-docs',
      collections: [collection('tab-3', 'extra.com')],
    })
    expect(categories[0]?.collections.map(({ id }) => id)).toStrictEqual(before)
  })

  it('他カテゴリの domains は影響を受けない', () => {
    const news = createParentCategory({
      collections: ['tab-99'].map((id, index) => ({
        id,
        domain: ['news.com'][index] ?? id,
      })),
      id: 'cat-news',
      name: 'News',
    })
    const result = reorderDomainsInCategory({
      categories: [buildDocs(), news],
      categoryId: 'cat-docs',
      collections: [
        collection('tab-3', 'extra.com'),
        collection('tab-2', 'docs.com'),
      ],
    })
    const updatedNews = result.updatedCategories.find(
      (c) => c.id === 'cat-news',
    )
    expect(updatedNews?.collections.map(({ id }) => id)).toStrictEqual([
      'tab-99',
    ])
  })
})
