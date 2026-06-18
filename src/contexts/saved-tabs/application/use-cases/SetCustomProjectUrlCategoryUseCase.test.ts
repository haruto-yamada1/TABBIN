import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import { createSetCustomProjectUrlCategoryUseCase } from './SetCustomProjectUrlCategoryUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  setUrlCategory: ReturnType<typeof vi.fn>
} => {
  const setUrlCategory = vi.fn(async () => undefined)
  const commandService = {
    addCategoryToProject: vi.fn(),
    addUrlToCustomProject: vi.fn(),
    moveUrlBetweenCustomProjects: vi.fn(),
    removeCategoryFromProject: vi.fn(),
    removeUrlFromCustomProject: vi.fn(),
    removeUrlIdsFromAllCustomProjects: vi.fn(),
    removeUrlsFromAllCustomProjects: vi.fn(),
    removeUrlsFromCustomProject: vi.fn(),
    renameCategoryInProject: vi.fn(),
    reorderProjectUrls: vi.fn(),
    setUrlCategory,
    updateCategoryOrder: vi.fn(),
    updateProjectKeywords: vi.fn(),
  }
  return {
    commandService: commandService as unknown as CustomProjectsCommandService,
    setUrlCategory,
  }
}

describe('SetCustomProjectUrlCategoryUseCase', () => {
  it('port の setUrlCategory を projectId / url / category で呼び出す', async () => {
    const { commandService, setUrlCategory } = buildCommandService()
    const useCase = createSetCustomProjectUrlCategoryUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      category: 'Inbox',
      projectId: 'project-1',
      url: 'https://example.com/a',
    })

    expect(setUrlCategory).toHaveBeenCalledWith(
      'project-1',
      'https://example.com/a',
      'Inbox',
    )
  })

  it('category が undefined の場合 port へ undefined をそのまま渡す', async () => {
    const { commandService, setUrlCategory } = buildCommandService()
    const useCase = createSetCustomProjectUrlCategoryUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      projectId: 'project-1',
      url: 'https://example.com/a',
    })

    expect(setUrlCategory).toHaveBeenCalledWith(
      'project-1',
      'https://example.com/a',
      undefined,
    )
  })
})
