import { beforeEach, describe, expect, it, vi } from 'vitest'

const tabStorageFns = vi.hoisted(() => ({
  removeSubCategoryFromTabGroup: vi.fn(),
  setCategoryKeywords: vi.fn(),
}))

vi.mock('@/lib/storage/tabs', () => ({
  removeSubCategoryFromTabGroup: tabStorageFns.removeSubCategoryFromTabGroup,
  setCategoryKeywords: tabStorageFns.setCategoryKeywords,
}))

import { createLibRemoveSubCategoryFromTabGroupAdapter } from './ChromeRemoveSubCategoryFromTabGroupAdapter'
import { createLibSetCategoryKeywordsAdapter } from './ChromeSetCategoryKeywordsAdapter'

describe('lib storage tab group adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tabStorageFns.removeSubCategoryFromTabGroup.mockResolvedValue(undefined)
    tabStorageFns.setCategoryKeywords.mockResolvedValue(undefined)
  })

  it('removeSubCategoryFromTabGroup を lib/storage に委譲する', async () => {
    const adapter = createLibRemoveSubCategoryFromTabGroupAdapter()

    await adapter.removeSubCategoryFromTabGroup('group-1', 'Work / Docs')

    expect(tabStorageFns.removeSubCategoryFromTabGroup).toHaveBeenCalledWith(
      'group-1',
      'Work / Docs',
    )
  })

  it('setCategoryKeywords は readonly keywords をコピーして lib/storage に委譲する', async () => {
    const adapter = createLibSetCategoryKeywordsAdapter()
    const keywords = ['docs', 'spec'] as const

    await adapter.setCategoryKeywords('group-1', 'Work', keywords)

    expect(tabStorageFns.setCategoryKeywords).toHaveBeenCalledWith(
      'group-1',
      'Work',
      ['docs', 'spec'],
    )
    expect(tabStorageFns.setCategoryKeywords.mock.calls[0]?.[2]).not.toBe(
      keywords,
    )
  })
})
