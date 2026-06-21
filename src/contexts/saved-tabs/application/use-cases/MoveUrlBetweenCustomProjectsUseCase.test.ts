import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'

import { createMoveUrlBetweenCustomProjectsUseCase } from './MoveUrlBetweenCustomProjectsUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  moveUrlBetweenCustomProjects: ReturnType<typeof vi.fn>
} => {
  const moveUrlBetweenCustomProjects = vi.fn(async () => undefined)
  const commandService = {
    addCategoryToProject: vi.fn(),
    addUrlToCustomProject: vi.fn(),
    moveUrlBetweenCustomProjects,
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
    commandService: commandService as unknown as CustomProjectsCommandService,
    moveUrlBetweenCustomProjects,
  }
}

describe('MoveUrlBetweenCustomProjectsUseCase', () => {
  it('port の moveUrlBetweenCustomProjects を sourceProjectId / targetProjectId / url で呼び出す', async () => {
    const { commandService, moveUrlBetweenCustomProjects } =
      buildCommandService()
    const useCase = createMoveUrlBetweenCustomProjectsUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      url: 'https://example.com/a',
    })

    expect(moveUrlBetweenCustomProjects).toHaveBeenCalledWith(
      'project-a',
      'project-b',
      'https://example.com/a',
    )
  })

  it('port が reject した例外をそのまま伝搬する', async () => {
    const { commandService, moveUrlBetweenCustomProjects } =
      buildCommandService()
    moveUrlBetweenCustomProjects.mockRejectedValueOnce(new Error('move failed'))
    const useCase = createMoveUrlBetweenCustomProjectsUseCase({
      customProjectsCommandService: commandService,
    })

    await expect(
      useCase({
        sourceProjectId: 'project-a',
        targetProjectId: 'project-b',
        url: 'https://example.com/a',
      }),
    ).rejects.toThrow('move failed')
  })
})
