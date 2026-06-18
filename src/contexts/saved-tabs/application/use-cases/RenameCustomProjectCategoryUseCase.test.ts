import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import { createRenameCustomProjectCategoryUseCase } from './RenameCustomProjectCategoryUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  renameCategoryInProject: ReturnType<typeof vi.fn>
} => {
  const renameCategoryInProject = vi.fn(async () => undefined)
  const commandService = {
    addCategoryToProject: vi.fn(),
    addUrlToCustomProject: vi.fn(),
    moveUrlBetweenCustomProjects: vi.fn(),
    removeCategoryFromProject: vi.fn(),
    removeUrlFromCustomProject: vi.fn(),
    removeUrlIdsFromAllCustomProjects: vi.fn(),
    removeUrlsFromAllCustomProjects: vi.fn(),
    removeUrlsFromCustomProject: vi.fn(),
    renameCategoryInProject,
    reorderProjectUrls: vi.fn(),
    setUrlCategory: vi.fn(),
    updateCategoryOrder: vi.fn(),
    updateProjectKeywords: vi.fn(),
  }
  return {
    commandService: commandService as unknown as CustomProjectsCommandService,
    renameCategoryInProject,
  }
}

describe('RenameCustomProjectCategoryUseCase', () => {
  it('port の renameCategoryInProject を projectId / old / new で呼び出す', async () => {
    const { commandService, renameCategoryInProject } = buildCommandService()
    const useCase = createRenameCustomProjectCategoryUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      newCategoryName: 'Later',
      oldCategoryName: 'Inbox',
      projectId: 'project-1',
    })

    expect(renameCategoryInProject).toHaveBeenCalledWith(
      'project-1',
      'Inbox',
      'Later',
    )
  })
})
