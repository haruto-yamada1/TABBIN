import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import { createUpdateCustomProjectKeywordsUseCase } from './UpdateCustomProjectKeywordsUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  updateProjectKeywords: ReturnType<typeof vi.fn>
} => {
  const updateProjectKeywords = vi.fn(async () => undefined)
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
    setUrlCategory: vi.fn(),
    updateCategoryOrder: vi.fn(),
    updateProjectKeywords,
  }
  return {
    commandService: commandService as unknown as CustomProjectsCommandService,
    updateProjectKeywords,
  }
}

describe('UpdateCustomProjectKeywordsUseCase', () => {
  it('port の updateProjectKeywords を projectId / projectKeywords で呼び出す', async () => {
    const { commandService, updateProjectKeywords } = buildCommandService()
    const useCase = createUpdateCustomProjectKeywordsUseCase({
      customProjectsCommandService: commandService,
    })
    const projectKeywords = {
      titleKeywords: ['docs'],
      urlKeywords: ['example'],
      domainKeywords: ['example.com'],
    }

    await useCase({ projectId: 'project-1', projectKeywords })

    expect(updateProjectKeywords).toHaveBeenCalledWith(
      'project-1',
      projectKeywords,
    )
  })
})
