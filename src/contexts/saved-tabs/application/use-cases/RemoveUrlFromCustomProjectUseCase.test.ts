import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import { createRemoveUrlFromCustomProjectUseCase } from './RemoveUrlFromCustomProjectUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  removeUrlFromCustomProject: ReturnType<typeof vi.fn>
} => {
  const removeUrlFromCustomProject = vi.fn(async () => undefined)
  const commandService = {
    addCategoryToProject: vi.fn(),
    addUrlToCustomProject: vi.fn(),
    moveUrlBetweenCustomProjects: vi.fn(),
    removeCategoryFromProject: vi.fn(),
    removeUrlFromCustomProject,
    removeUrlIdsFromAllCustomProjects: vi.fn(),
    removeUrlsFromAllCustomProjects: vi.fn(),
    removeUrlsFromCustomProject: vi.fn(),
    renameCategoryInProject: vi.fn(),
    reorderProjectUrls: vi.fn(),
    setUrlCategory: vi.fn(),
    updateCategoryOrder: vi.fn(),
    updateProjectKeywords: vi.fn(),
  }
  return {
    commandService: commandService as unknown as CustomProjectsCommandService,
    removeUrlFromCustomProject,
  }
}

describe('RemoveUrlFromCustomProjectUseCase', () => {
  it('port の removeUrlFromCustomProject を projectId / url で呼び出す', async () => {
    const { commandService, removeUrlFromCustomProject } = buildCommandService()
    const useCase = createRemoveUrlFromCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      projectId: 'project-1',
      url: 'https://example.com/a',
    })

    expect(removeUrlFromCustomProject).toHaveBeenCalledWith(
      'project-1',
      'https://example.com/a',
    )
  })
})
