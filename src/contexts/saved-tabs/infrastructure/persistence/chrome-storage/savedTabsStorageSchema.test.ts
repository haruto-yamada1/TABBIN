import { describe, expect, it } from 'vitest'

import {
  CustomProjectRawArraySchema,
  CustomProjectRawSchema,
  ParentCategoryRawSchema,
  SavedTabRawArraySchema,
  SavedTabRawSchema,
  UrlRecordRawArraySchema,
  UrlRecordRawSchema,
} from './savedTabsStorageSchema'

describe('savedTabsStorageSchema', () => {
  describe('SavedTabRawSchema', () => {
    it('最小フィールドだけを持つ savedTab を通す', () => {
      const result = SavedTabRawSchema.safeParse({
        domain: 'https://example.com',
        id: 'group-1',
      })
      expect(result.success).toBe(true)
    })

    it('rich なオプションフィールドを持つ savedTab を通す', () => {
      const result = SavedTabRawSchema.safeParse({
        categoryKeywords: [{ categoryName: 'docs', keywords: ['doc'] }],
        domain: 'https://example.com',
        id: 'group-1',
        parentCategoryId: 'cat-1',
        savedAt: 1_700_000_000_000,
        subCategories: ['docs'],
        subCategoryOrder: ['docs'],
        subCategoryOrderWithUncategorized: ['docs', 'uncategorized'],
        urlIds: ['url-1', 'url-2'],
        urlSubCategories: { 'url-1': 'docs' },
        urls: [
          {
            id: 'url-1',
            savedAt: 1,
            subCategory: 'docs',
            title: 'A',
            url: 'https://example.com/a',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('id / domain が無い savedTab を弾く', () => {
      expect(SavedTabRawSchema.safeParse({ urlIds: [] }).success).toBe(false)
      expect(SavedTabRawSchema.safeParse({ id: 'g-1' }).success).toBe(false)
    })

    it('配列パースで不正な要素を弾く', () => {
      const result = SavedTabRawArraySchema.safeParse([
        { domain: 'https://example.com', id: 'group-1' },
        { domain: 'https://broken' },
        null,
        'not-an-object',
      ])
      expect(result.success).toBe(false)
    })
  })

  describe('UrlRecordRawSchema', () => {
    it('必須フィールドを持つ url record を通す', () => {
      const result = UrlRecordRawSchema.safeParse({
        id: 'url-1',
        savedAt: 1,
        title: 'A',
        url: 'https://example.com',
      })
      expect(result.success).toBe(true)
    })

    it('favIconUrl 省略を許容する', () => {
      const result = UrlRecordRawSchema.safeParse({
        id: 'url-1',
        savedAt: 1,
        title: 'A',
        url: 'https://example.com',
      })
      expect(result.success).toBe(true)
      if (!result.success) {
        return
      }
      expect(result.data.favIconUrl).toBeUndefined()
    })

    it('savedAt が無い record を弾く', () => {
      expect(
        UrlRecordRawSchema.safeParse({
          id: 'url-1',
          title: 'A',
          url: 'https://example.com',
        }).success,
      ).toBe(false)
    })

    it('配列パースで必須欠けを弾く', () => {
      const result = UrlRecordRawArraySchema.safeParse([
        { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com' },
        { id: 'url-2', title: 'B', url: 'https://example.com' },
      ])
      expect(result.success).toBe(false)
    })
  })

  describe('ParentCategoryRawSchema', () => {
    it('必須フィールドを持つ parent category を通す', () => {
      const result = ParentCategoryRawSchema.safeParse({
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(result.success).toBe(true)
    })

    it('domains / domainNames が無い category を弾く', () => {
      expect(
        ParentCategoryRawSchema.safeParse({ id: 'cat-1', name: 'Docs' })
          .success,
      ).toBe(false)
    })
  })

  describe('CustomProjectRawSchema', () => {
    it('必須フィールドを持つ custom project を通す', () => {
      const result = CustomProjectRawSchema.safeParse({
        categories: ['research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        updatedAt: 1,
      })
      expect(result.success).toBe(true)
    })

    it('categories が無い project を弾く', () => {
      expect(
        CustomProjectRawSchema.safeParse({
          createdAt: 1,
          id: 'project-1',
          name: 'Q4',
          updatedAt: 1,
        }).success,
      ).toBe(false)
    })

    it('rich なオプションフィールドを持つ project を通す', () => {
      const result = CustomProjectRawSchema.safeParse({
        categories: ['research'],
        categoryOrder: ['research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: ['Q4'],
          urlKeywords: [],
        },
        updatedAt: 2,
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': { category: 'research', notes: 'note' },
        },
        urls: [
          {
            category: 'research',
            notes: 'note',
            savedAt: 1,
            title: 'A',
            url: 'https://example.com',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('配列パースで必須欠けを弾く', () => {
      const result = CustomProjectRawArraySchema.safeParse([
        {
          categories: ['research'],
          createdAt: 1,
          id: 'project-1',
          name: 'Q4',
          updatedAt: 1,
        },
        {
          createdAt: 1,
          id: 'project-2',
          name: 'Q5',
          updatedAt: 1,
        },
      ])
      expect(result.success).toBe(false)
    })
  })
})
