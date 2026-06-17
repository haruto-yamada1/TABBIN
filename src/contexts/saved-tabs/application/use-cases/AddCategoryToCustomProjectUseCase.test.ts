import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import { createAddCategoryToCustomProjectUseCase } from './AddCategoryToCustomProjectUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  addCategoryToProject: ReturnType<typeof vi.fn>
} => {
  const addCategoryToProject = vi.fn(
    // eslint-disable-next-line typescript/require-await
    async () => undefined,
  )
  const commandService = {
    addCategoryToProject,
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
    updateProjectKeywords: vi.fn(),
  }
  return {
    addCategoryToProject,
    commandService: commandService as unknown as CustomProjectsCommandService,
  }
}

describe('AddCategoryToCustomProjectUseCase', () => {
  it('port の addCategoryToProject を projectId / categoryName で呼び出す', async () => {
    const { commandService, addCategoryToProject } = buildCommandService()
    const useCase = createAddCategoryToCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({ projectId: 'project-1', categoryName: 'Inbox' })

    expect(addCategoryToProject).toHaveBeenCalledWith('project-1', 'Inbox')
  })

  it('port が reject した例外をそのまま伝搬する', async () => {
    const { commandService, addCategoryToProject } = buildCommandService()
    addCategoryToProject.mockRejectedValueOnce(new Error('storage failure'))
    const useCase = createAddCategoryToCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await expect(
      useCase({ projectId: 'project-1', categoryName: 'Inbox' }),
    ).rejects.toThrow('storage failure')
  })
})
