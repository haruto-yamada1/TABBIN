import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/storage/tabs', () => ({
  setCategoryKeywords: vi.fn(),
}))

import { setCategoryKeywords } from '@/lib/storage/tabs'

import { handleSaveKeywords } from './category-keywords'

describe('handleSaveKeywords関数', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('カテゴリキーワードを保存して成功ログを出力する', async () => {
    vi.mocked(setCategoryKeywords).mockResolvedValue(undefined)

    await expect(
      handleSaveKeywords('group-1', 'Docs', ['guide', 'api']),
    ).resolves.toBeUndefined()

    expect(setCategoryKeywords).toHaveBeenCalledWith('group-1', 'Docs', [
      'guide',
      'api',
    ])
    expect(console.log).toHaveBeenCalledWith(
      'カテゴリキーワードを保存しました:',
      {
        groupId: 'group-1',
        categoryName: 'Docs',
        keywords: ['guide', 'api'],
      },
    )
  })

  it('ストレージエラーを握りつぶしてログ出力する', async () => {
    const error = new Error('save failed')
    vi.mocked(setCategoryKeywords).mockRejectedValue(error)

    await expect(
      handleSaveKeywords('group-1', 'Docs', ['guide']),
    ).resolves.toBeUndefined()

    expect(console.error).toHaveBeenCalledWith(
      'カテゴリキーワード保存エラー:',
      error,
    )
  })
})
