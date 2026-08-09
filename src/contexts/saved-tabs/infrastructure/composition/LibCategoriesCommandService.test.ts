import { describe, expect, it, vi } from 'vitest'

const updateDomainCategorySettings = vi.hoisted(() => vi.fn())

vi.mock('@/lib/storage/categories', () => ({ updateDomainCategorySettings }))

import { createLibCategoriesCommandService } from './LibCategoriesCommandService'

describe('createLibCategoriesCommandService', () => {
  it('application DTO を storage 形式へ変換して委譲する', async () => {
    const service = createLibCategoriesCommandService()

    await service.updateCollectionCategories(
      {
        createdAt: 0,
        definition: { domain: 'example.com', type: 'domain' },
        id: 'collection-1',
        name: 'example.com',
        sortOrder: 0,
        updatedAt: 0,
      },
      [
        {
          collectionId: 'collection-1',
          createdAt: 0,
          id: 'category-1',
          keywords: ['guide'],
          name: 'Docs',
          sortOrder: 0,
          updatedAt: 0,
        },
      ],
    )

    expect(updateDomainCategorySettings).toHaveBeenCalledWith(
      'example.com',
      ['Docs'],
      [{ categoryName: 'Docs', keywords: ['guide'] }],
    )
  })
})
