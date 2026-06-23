import { describe, expect, it, vi } from 'vitest'

const updateDomainCategorySettings = vi.hoisted(() => vi.fn())

vi.mock('@/lib/storage/categories', () => ({ updateDomainCategorySettings }))

import { createLibCategoriesCommandService } from './LibCategoriesCommandService'

describe('createLibCategoriesCommandService', () => {
  it('application DTO を storage 形式へ変換して委譲する', async () => {
    const service = createLibCategoriesCommandService()

    await service.updateDomainCategorySettings(
      'example.com',
      ['Docs'],
      [{ categoryName: 'Docs', keywords: ['guide'] }],
    )

    expect(updateDomainCategorySettings).toHaveBeenCalledWith(
      'example.com',
      ['Docs'],
      [{ categoryName: 'Docs', keywords: ['guide'] }],
    )
  })
})
