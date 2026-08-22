import { describe, expect, it } from 'vitest'

import { buildMergedExistingDomainTab } from './settings-merge'

describe('buildMergedExistingDomainTab', () => {
  it('既存タブの空文字 parentCategoryId は imported 欠損時も保持する', async () => {
    const merged = await buildMergedExistingDomainTab(
      {
        categoryKeywords: [],
        domain: 'empty-parent.example.com',
        id: 'existing-empty-parent',
        parentCategoryId: '',
        subCategories: [],
        urlIds: [],
      },
      {
        domain: 'empty-parent.example.com',
        id: 'imported-empty-parent',
        urls: [],
      },
    )

    expect(merged.parentCategoryId).toBe('')
    expect(Object.hasOwn(merged, 'parentCategoryId')).toBe(true)
  })
})
