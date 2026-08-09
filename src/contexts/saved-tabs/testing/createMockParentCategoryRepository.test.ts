import { describe, expect, it } from 'vitest'

import {
  createMockParentCategoryRepository,
  toMockParentCategory,
} from './createMockParentCategoryRepository'

describe('createMockParentCategoryRepository', () => {
  it('初期 parentCategories を findAll で返す', async () => {
    const repo = createMockParentCategoryRepository({
      parentCategories: [toMockParentCategory({ id: 'c1', name: 'Docs' })],
    })
    const all = await repo.findAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.id).toBe('c1')
  })

  it('findById は一致するエントリを返し、無ければ null', async () => {
    const repo = createMockParentCategoryRepository({
      parentCategories: [toMockParentCategory({ id: 'c1', name: 'Docs' })],
    })
    const found = await repo.findById('c1' as never)
    const missing = await repo.findById('c2' as never)
    expect(found?.id).toBe('c1')
    expect(missing).toBeNull()
  })

  it('saveAll は state を差し替える', async () => {
    const repo = createMockParentCategoryRepository({
      parentCategories: [toMockParentCategory({ id: 'c1', name: 'Docs' })],
    })
    await repo.saveAll([toMockParentCategory({ id: 'c2', name: 'News' })])
    const all = await repo.findAll()
    expect(all.map((c) => c.id)).toStrictEqual(['c2'])
  })

  it('removeByIds は指定 id の parent category だけを除外する', async () => {
    const repo = createMockParentCategoryRepository({
      parentCategories: [
        toMockParentCategory({ id: 'c1', name: 'Docs' }),
        toMockParentCategory({ id: 'c2', name: 'News' }),
        toMockParentCategory({ id: 'c3', name: 'Work' }),
      ],
    })

    await repo.removeByIds(['c1', 'c3'] as never)

    const all = await repo.findAll()
    expect(all.map((category) => category.id)).toStrictEqual(['c2'])
  })

  it('toMockParentCategory は domain fields を保持し配列をコピーする', () => {
    const domainNames = ['example.com']
    const domains = ['group-1']
    const category = toMockParentCategory({
      domainNames,
      domains,
      id: 'c1',
      name: 'Docs',
    })

    expect(category).toMatchObject({
      collections: ['group-1'].map((id, index) => ({
        id,
        domain: ['example.com'][index] ?? id,
      })),
    })
    expect(category.collections.map(({ domain }) => domain)).not.toBe(
      domainNames,
    )
    expect(category.collections.map(({ id }) => id)).not.toBe(domains)
  })
})
