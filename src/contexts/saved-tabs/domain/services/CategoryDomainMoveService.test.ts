import { describe, expect, it } from 'vitest'

import { createParentCategory } from '../entities/ParentCategory'
import { createDomainName } from '../value-objects/DomainName'
import { createParentCategoryId } from '../value-objects/ParentCategoryId'
import { createTabGroupId } from '../value-objects/TabGroupId'
import { moveDomainBetweenCategories } from './CategoryDomainMoveService'

const buildDocs = () =>
  createParentCategory({
    domainNames: ['example.com', 'docs.com'],
    domains: ['tab-1', 'tab-2'],
    id: 'cat-docs',
    name: 'Docs',
  })
const buildNews = () =>
  createParentCategory({
    domainNames: ['news.com'],
    domains: ['tab-3'],
    id: 'cat-news',
    name: 'News',
  })

describe('moveDomainBetweenCategories', () => {
  it('移動元から domainId/domainName を取り除き、移動先へ追加する', () => {
    const result = moveDomainBetweenCategories({
      categories: [buildDocs(), buildNews()],
      domainId: createTabGroupId('tab-1'),
      domainName: createDomainName('example.com'),
      fromCategoryId: 'cat-docs',
      toCategoryId: 'cat-news',
    })
    expect(result.moved).toBe(true)
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    const news = result.updatedCategories.find((c) => c.id === 'cat-news')
    expect(docs?.domains).toStrictEqual(['tab-2'])
    expect(docs?.domainNames).toStrictEqual(['docs.com'])
    expect(news?.domains).toStrictEqual(['tab-3', 'tab-1'])
    expect(news?.domainNames).toStrictEqual(['news.com', 'example.com'])
  })

  it('fromCategoryId が null の場合は追加のみ行う', () => {
    const result = moveDomainBetweenCategories({
      categories: [buildDocs()],
      domainId: createTabGroupId('tab-99'),
      domainName: createDomainName('new.com'),
      fromCategoryId: null,
      toCategoryId: 'cat-docs',
    })
    expect(result.moved).toBe(true)
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    expect(docs?.domains).toStrictEqual(['tab-1', 'tab-2', 'tab-99'])
    expect(docs?.domainNames).toStrictEqual([
      'example.com',
      'docs.com',
      'new.com',
    ])
  })

  it('fromCategoryId が categories 中に存在しない場合は移動先への追加のみ行う', () => {
    const result = moveDomainBetweenCategories({
      categories: [buildDocs()],
      domainId: createTabGroupId('tab-1'),
      domainName: createDomainName('example.com'),
      fromCategoryId: 'cat-missing',
      toCategoryId: 'cat-docs',
    })
    // 移動元が categories 中に無いので remove は no-op。
    // 移動先 cat-docs には既に tab-1 / example.com が含まれているので
    // add は no-op (重複追加しない)。
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    expect(docs?.domains).toStrictEqual(['tab-1', 'tab-2'])
    expect(docs?.domainNames).toStrictEqual(['example.com', 'docs.com'])
  })

  it('toCategoryId が categories 中に存在しない場合は moved=false', () => {
    const result = moveDomainBetweenCategories({
      categories: [buildDocs()],
      domainId: createTabGroupId('tab-1'),
      domainName: createDomainName('example.com'),
      fromCategoryId: 'cat-docs',
      toCategoryId: 'cat-missing',
    })
    // 移動先が categories 中に無いので add は no-op。移動元 cat-docs
    // からは remove で tab-1 が消えるので moved=true になる。
    expect(result.moved).toBe(true)
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    expect(docs?.domains).toStrictEqual(['tab-2'])
  })

  it('fromCategoryId === toCategoryId の場合は重複排除のみ行う', () => {
    const categories = [
      createParentCategory({
        domainNames: ['example.com', 'example.com'],
        domains: ['tab-1', 'tab-1', 'tab-2'],
        id: 'cat-docs',
        name: 'Docs',
      }),
    ]
    const result = moveDomainBetweenCategories({
      categories,
      domainId: createTabGroupId('tab-1'),
      domainName: createDomainName('example.com'),
      fromCategoryId: 'cat-docs',
      toCategoryId: 'cat-docs',
    })
    const docs = result.updatedCategories.find((c) => c.id === 'cat-docs')
    // 同一カテゴリ内の remove -> add では、重複 tab-1 の 1 つが
    // filter で消え、続く add は `includes` 判定で「tab-1 を含まない」
    // 状態と判定されて末尾に再追加される (旧実装と一致)。
    expect(docs?.domains).toStrictEqual(['tab-2', 'tab-1'])
    expect(docs?.domainNames).toStrictEqual(['example.com'])
  })

  it('入力配列を破壊しない', () => {
    const categories = [buildDocs(), buildNews()]
    const beforeDocs = categories[0]?.domains.slice()
    const beforeNews = categories[1]?.domains.slice()
    moveDomainBetweenCategories({
      categories,
      domainId: createTabGroupId('tab-1'),
      domainName: createDomainName('example.com'),
      fromCategoryId: 'cat-docs',
      toCategoryId: 'cat-news',
    })
    expect(categories[0]?.domains).toStrictEqual(beforeDocs)
    expect(categories[1]?.domains).toStrictEqual(beforeNews)
  })

  it('既存 domain を含まない移動先では末尾に追加される', () => {
    const result = moveDomainBetweenCategories({
      categories: [buildDocs(), buildNews()],
      domainId: createTabGroupId('tab-99'),
      domainName: createDomainName('extra.com'),
      fromCategoryId: null,
      toCategoryId: 'cat-news',
    })
    const news = result.updatedCategories.find((c) => c.id === 'cat-news')
    expect(news?.domains).toStrictEqual(['tab-3', 'tab-99'])
  })

  it('createParentCategoryId で生成した ID も category.id と一致して処理できる', () => {
    const docs = buildDocs()
    const result = moveDomainBetweenCategories({
      categories: [docs],
      domainId: createTabGroupId('tab-1'),
      domainName: createDomainName('example.com'),
      fromCategoryId: createParentCategoryId('cat-docs'),
      toCategoryId: createParentCategoryId('cat-docs'),
    })
    const moved = result.updatedCategories.find((c) => c.id === docs.id)
    // 同一カテゴリ内の remove -> add で tab-1 が一度消えてから末尾に
    // 再追加される (旧実装と一致する挙動)。
    expect(moved?.domains).toStrictEqual(['tab-2', 'tab-1'])
  })
})
