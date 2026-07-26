import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

import { createRemoveCategoryFromCustomProjectUseCase } from './RemoveCategoryFromCustomProjectUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  removeCategoryFromProject: ReturnType<typeof vi.fn>
} => {
  const removeCategoryFromProject = vi.fn(async () => undefined)
  const commandService = {
    addCategoryToProject: vi.fn(),
    addUrlToCustomProject: vi.fn(),
    moveUrlBetweenCustomProjects: vi.fn(),
    removeCategoryFromProject,
    removeUrlFromCustomProject: vi.fn(),
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
    removeCategoryFromProject,
  }
}

describe('RemoveCategoryFromCustomProjectUseCase', () => {
  it('port の removeCategoryFromProject を projectId / categoryName で呼び出す', async () => {
    const { commandService, removeCategoryFromProject } = buildCommandService()
    const useCase = createRemoveCategoryFromCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({ projectId: 'project-1', categoryName: 'Inbox' })

    expect(removeCategoryFromProject).toHaveBeenCalledWith('project-1', 'Inbox')
  })

  it('port が reject した例外をそのまま伝搬する', async () => {
    const { commandService, removeCategoryFromProject } = buildCommandService()
    removeCategoryFromProject.mockRejectedValueOnce(
      new Error('storage failure'),
    )
    const useCase = createRemoveCategoryFromCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await expect(
      useCase({ projectId: 'project-1', categoryName: 'Inbox' }),
    ).rejects.toThrow('storage failure')
  })
})
