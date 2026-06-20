import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'

import { handleSaveKeywords } from './category-keywords'

const createMockUseCases = (): SavedTabsUseCases => {
  const setCategoryKeywords = vi.fn().mockResolvedValue(undefined)
  return {
    setCategoryKeywords,
  } as unknown as SavedTabsUseCases
}

describe('handleSaveKeywords関数', () => {
  let useCases: SavedTabsUseCases

  beforeEach(() => {
    useCases = createMockUseCases()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('カテゴリキーワードを保存して成功ログを出力する', async () => {
    await expect(
      handleSaveKeywords(useCases, 'group-1', 'Docs', ['guide', 'api']),
    ).resolves.toBeUndefined()

    expect(useCases.setCategoryKeywords).toHaveBeenCalledWith({
      tabGroupId: 'group-1',
      categoryName: 'Docs',
      keywords: ['guide', 'api'],
    })
    expect(console.log).toHaveBeenCalledWith(
      'カテゴリキーワードを保存しました:',
      {
        categoryName: 'Docs',
        groupId: 'group-1',
        keywords: ['guide', 'api'],
      },
    )
  })

  it('ストレージエラーを握りつぶしてログ出力する', async () => {
    const error = new Error('save failed')
    vi.mocked(useCases.setCategoryKeywords).mockRejectedValueOnce(error)

    await expect(
      handleSaveKeywords(useCases, 'group-1', 'Docs', ['guide']),
    ).resolves.toBeUndefined()

    expect(console.error).toHaveBeenCalledWith(
      'カテゴリキーワード保存エラー:',
      error,
    )
  })
})
