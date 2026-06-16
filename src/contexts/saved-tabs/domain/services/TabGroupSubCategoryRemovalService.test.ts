import { describe, expect, it } from 'vitest'

import { removeSubCategoryFromGroup } from './TabGroupSubCategoryRemovalService'

const baseGroup = {
  categoryKeywords: [
    { categoryName: 'docs', keywords: ['guide'] },
    { categoryName: 'news', keywords: ['headline'] },
  ],
  id: 'group-1',
  subCategories: ['docs', 'news'],
  urlSubCategories: { 'url-1': 'docs', 'url-2': 'news', 'url-3': 'docs' },
}

describe('TabGroupSubCategoryRemovalService.removeSubCategoryFromGroup', () => {
  it('指定 groupId と一致しない group はそのまま返す', () => {
    const result = removeSubCategoryFromGroup(baseGroup, 'other-group', 'docs')
    expect(result).toBe(baseGroup)
  })

  it('subCategories / urlSubCategories / categoryKeywords の 3 箇所から categoryName が削除される', () => {
    const result = removeSubCategoryFromGroup(baseGroup, 'group-1', 'docs')
    expect(result.subCategories).toStrictEqual(['news'])
    expect(result.urlSubCategories).toStrictEqual({ 'url-2': 'news' })
    expect(result.categoryKeywords).toStrictEqual([
      { categoryName: 'news', keywords: ['headline'] },
    ])
    expect(result.id).toBe('group-1')
  })

  it('subCategories / urlSubCategories / categoryKeywords が未設定でも例外を投げない', () => {
    const emptyGroup = { id: 'group-1' } as Parameters<
      typeof removeSubCategoryFromGroup
    >[0]
    const result = removeSubCategoryFromGroup(emptyGroup, 'group-1', 'docs')
    expect(result.subCategories).toBeUndefined()
    expect(result.urlSubCategories).toBeUndefined()
    expect(result.categoryKeywords).toBeUndefined()
  })

  it('categoryName が subCategories に存在しない場合は subCategories を変更しない', () => {
    const group = { ...baseGroup, subCategories: ['news'] }
    const result = removeSubCategoryFromGroup(group, 'group-1', 'docs')
    expect(result.subCategories).toStrictEqual(['news'])
    expect(result.urlSubCategories).toStrictEqual({ 'url-2': 'news' })
    expect(result.categoryKeywords).toStrictEqual([
      { categoryName: 'news', keywords: ['headline'] },
    ])
  })

  it('categoryName が urlSubCategories に存在しない場合は urlSubCategories を変更しない', () => {
    const group = {
      ...baseGroup,
      urlSubCategories: { 'url-1': 'news' },
    }
    const result = removeSubCategoryFromGroup(group, 'group-1', 'docs')
    expect(result.subCategories).toStrictEqual(['news'])
    expect(result.urlSubCategories).toStrictEqual({ 'url-1': 'news' })
    expect(result.categoryKeywords).toStrictEqual([
      { categoryName: 'news', keywords: ['headline'] },
    ])
  })

  it('categoryName が categoryKeywords に存在しない場合は categoryKeywords を変更しない', () => {
    const group = {
      ...baseGroup,
      categoryKeywords: [{ categoryName: 'news', keywords: ['headline'] }],
    }
    const result = removeSubCategoryFromGroup(group, 'group-1', 'docs')
    expect(result.subCategories).toStrictEqual(['news'])
    expect(result.urlSubCategories).toStrictEqual({ 'url-2': 'news' })
    expect(result.categoryKeywords).toStrictEqual([
      { categoryName: 'news', keywords: ['headline'] },
    ])
  })

  it('戻り値は新しいオブジェクトであり、入力オブジェクトのフィールドは破壊的に変更しない', () => {
    const group = { ...baseGroup }
    const originalSubCategories = [...group.subCategories]
    const originalUrlSubCategories = { ...group.urlSubCategories }
    const originalCategoryKeywords = [...group.categoryKeywords]
    const result = removeSubCategoryFromGroup(group, 'group-1', 'docs')
    expect(result).not.toBe(group)
    expect(group.subCategories).toStrictEqual(originalSubCategories)
    expect(group.urlSubCategories).toStrictEqual(originalUrlSubCategories)
    expect(group.categoryKeywords).toStrictEqual(originalCategoryKeywords)
  })
})
