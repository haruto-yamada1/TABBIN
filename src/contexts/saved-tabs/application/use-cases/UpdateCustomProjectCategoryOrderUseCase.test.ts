import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import { createUpdateCustomProjectCategoryOrderUseCase } from './UpdateCustomProjectCategoryOrderUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  updateCategoryOrder: ReturnType<typeof vi.fn>
} => {
  const updateCategoryOrder = vi.fn(
    // eslint-disable-next-line typescript/require-await
    async () => undefined,
  )
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
    updateCategoryOrder,
    updateProjectKeywords: vi.fn(),
  }
  return {
    commandService: commandService as unknown as CustomProjectsCommandService,
    updateCategoryOrder,
  }
}

describe('UpdateCustomProjectCategoryOrderUseCase', () => {
  it('port の updateCategoryOrder を projectId / newOrder で呼び出す', async () => {
    const { commandService, updateCategoryOrder } = buildCommandService()
    const useCase = createUpdateCustomProjectCategoryOrderUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      newOrder: ['Inbox', 'Done'],
      projectId: 'project-1',
    })

    expect(updateCategoryOrder).toHaveBeenCalledWith('project-1', [
      'Inbox',
      'Done',
    ])
  })
})
