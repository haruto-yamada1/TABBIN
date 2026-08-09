import { describe, expect, it } from 'vitest'

import {
  createMockTabGroupRepository,
  toMockTabGroup,
} from './createMockTabGroupRepository'

describe('createMockTabGroupRepository', () => {
  it('初期 savedTabs を findAll で返す', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'g1' })],
    })
    const all = await repo.findAll()
    expect(all).toHaveLength(1)
    expect(all[0]?.id).toBe('g1')
  })

  it('findById は一致するエントリを返し、無ければ null', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'g1' })],
    })
    const found = await repo.findById('g1' as never)
    const missing = await repo.findById('g2' as never)
    expect(found?.id).toBe('g1')
    expect(missing).toBeNull()
  })

  it('saveAll は state を差し替える', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'g1' })],
    })
    const next = [toMockTabGroup({ domain: 'other.com', id: 'g2' })]
    await repo.saveAll(next)
    const all = await repo.findAll()
    expect(all.map((t) => t.id)).toStrictEqual(['g2'])
  })

  it('removeByIds は指定 id を除外する', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [
        toMockTabGroup({ domain: 'a.com', id: 'g1' }),
        toMockTabGroup({ domain: 'b.com', id: 'g2' }),
      ],
    })
    await repo.removeByIds(['g1'] as never)
    const all = await repo.findAll()
    expect(all.map((t) => t.id)).toStrictEqual(['g2'])
  })

  it('raw domain は一致する値を返し、無ければ null を返す', async () => {
    const repo = createMockTabGroupRepository({
      savedTabs: [toMockTabGroup({ domain: 'example.com', id: 'g1' })],
    })

    await expect(repo.findRawDomainById('g1' as never)).resolves.toBe(
      'example.com',
    )
    await expect(repo.findRawDomainById('missing' as never)).resolves.toBeNull()
  })

  it('tab group summary は normalized projection を返し、無ければ null を返す', async () => {
    const keywords = ['guide', 'reference']
    const source = toMockTabGroup({
      categoryKeywords: [{ categoryName: 'Docs', keywords }],
      domain: 'example.com',
      id: 'g1',
      parentCategoryId: 'category-1',
      subCategories: ['Docs'],
    })
    const repo = createMockTabGroupRepository({ savedTabs: [source] })

    const raw = await repo.findRawTabGroupById('g1' as never)

    expect(raw?.collection).toStrictEqual({
      createdAt: 0,
      definition: { domain: 'example.com', type: 'domain' },
      groupId: 'category-1',
      id: 'g1',
      name: 'example.com',
      sortOrder: 0,
      updatedAt: 0,
    })
    expect(raw?.collectionCategories).toStrictEqual([
      expect.objectContaining({
        keywords: ['guide', 'reference'],
        name: 'Docs',
      }),
    ])
    expect(raw?.collectionCategories[0]?.keywords).not.toBe(keywords)
    await expect(
      repo.findRawTabGroupById('missing' as never),
    ).resolves.toBeNull()
  })

  it('toMockTabGroup は full/minimal 入力を normalized projection に変換する', () => {
    const full = toMockTabGroup({
      categoryKeywords: [{ categoryName: 'Docs', keywords: ['guide'] }],
      domain: 'example.com',
      id: 'g1',
      parentCategoryId: 'category-1',
      savedAt: 1,
      subCategories: ['Docs'],
      subCategoryOrder: ['Docs'],
      subCategoryOrderWithUncategorized: ['Docs', 'uncategorized'],
      urlIds: ['url-1'],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          subCategory: 'Docs',
          title: 'Example',
          url: 'https://example.com',
        },
      ],
    })
    const minimal = toMockTabGroup({ domain: 'minimal.example', id: 'g2' })

    expect(full.collection).toMatchObject({
      definition: { domain: 'example.com', type: 'domain' },
      groupId: 'category-1',
      id: 'g1',
    })
    expect(full.collectionCategories).toStrictEqual([
      expect.objectContaining({ name: 'Docs' }),
    ])
    expect(full.memberships).toStrictEqual([
      expect.objectContaining({
        categoryId: 'g1:category:0',
        collectionId: 'g1',
        urlId: 'url-1',
      }),
    ])
    expect(minimal).toMatchObject({
      collection: {
        definition: { domain: 'minimal.example', type: 'domain' },
        id: 'g2',
      },
      collectionCategories: [],
      memberships: [],
    })
  })
})
