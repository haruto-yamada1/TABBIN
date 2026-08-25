import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

import { createReorderCustomProjectUrlsUseCase } from './ReorderCustomProjectUrlsUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  reorderProjectUrls: ReturnType<typeof vi.fn>
} => {
  const reorderProjectUrls = vi.fn(async () => undefined)
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
    reorderProjectUrls,
    setUrlCategory: vi.fn(),
    updateCategoryOrder: vi.fn(),
    updateProjectKeywords: vi.fn(),
  }
  return {
    commandService: commandService as unknown as CustomProjectsCommandService,
    reorderProjectUrls,
  }
}

describe('ReorderCustomProjectUrlsUseCase', () => {
  it('port の reorderProjectUrls を projectId / urls で呼び出す', async () => {
    const { commandService, reorderProjectUrls } = buildCommandService()
    const useCase = createReorderCustomProjectUrlsUseCase({
      customProjectsCommandService: commandService,
    })
    const urls = [
      {
        id: 'url-b',
        savedAt: 1,
        title: 'B',
        url: 'https://example.com/b',
      },
    ]

    await useCase({ projectId: 'project-1', urls })

    expect(reorderProjectUrls).toHaveBeenCalledWith('project-1', urls)
  })

  it('空のcurrent URL projectionをそのままportへ渡す', async () => {
    const { commandService, reorderProjectUrls } = buildCommandService()
    const useCase = createReorderCustomProjectUrlsUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({ projectId: 'project-1', urls: [] })

    expect(reorderProjectUrls).toHaveBeenCalledWith('project-1', [])
  })
})
