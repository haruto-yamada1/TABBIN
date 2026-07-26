import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SetCategoryKeywordsPort } from '@/contexts/saved-tabs/application/ports/SetCategoryKeywordsPort'

import { createSetCategoryKeywordsUseCase } from './SetCategoryKeywordsUseCase'
import type { SetCategoryKeywordsUseCaseDeps } from './SetCategoryKeywordsUseCase'

describe('SetCategoryKeywordsUseCase', () => {
  let deps: SetCategoryKeywordsUseCaseDeps
  let setCategoryKeywords: ReturnType<
    typeof vi.fn<SetCategoryKeywordsPort['setCategoryKeywords']>
  >

  beforeEach(() => {
    setCategoryKeywords = vi.fn().mockResolvedValue(undefined)
    deps = {
      setCategoryKeywordsPort: {
        setCategoryKeywords,
      },
    }
  })

  it('port の setCategoryKeywords を委譲呼び出しする', async () => {
    const useCase = createSetCategoryKeywordsUseCase(deps)
    await useCase({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      tabGroupId: 'group-1' as never,
      categoryName: 'Docs',
      keywords: ['guide', 'api'],
    })
    expect(setCategoryKeywords).toHaveBeenCalledWith('group-1', 'Docs', [
      'guide',
      'api',
    ])
  })

  it('port が失敗したら例外を伝播する', async () => {
    setCategoryKeywords.mockRejectedValueOnce(new Error('save failed'))
    const useCase = createSetCategoryKeywordsUseCase(deps)
    await expect(
      useCase({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        tabGroupId: 'group-1' as never,
        categoryName: 'Docs',
        keywords: ['guide'],
      }),
    ).rejects.toThrow('save failed')
  })
})
