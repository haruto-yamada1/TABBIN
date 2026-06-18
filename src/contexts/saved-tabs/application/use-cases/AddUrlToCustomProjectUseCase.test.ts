import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import { createAddUrlToCustomProjectUseCase } from './AddUrlToCustomProjectUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  addUrlToCustomProject: ReturnType<typeof vi.fn>
} => {
  const addUrlToCustomProject = vi.fn(async () => undefined)
  const commandService = {
    addCategoryToProject: vi.fn(),
    addUrlToCustomProject,
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
    addUrlToCustomProject,
    commandService: commandService as unknown as CustomProjectsCommandService,
  }
}

describe('AddUrlToCustomProjectUseCase', () => {
  it('port の addUrlToCustomProject を title / url / projectId で呼び出す', async () => {
    const { commandService, addUrlToCustomProject } = buildCommandService()
    const useCase = createAddUrlToCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      projectId: 'project-1',
      title: 'Example',
      url: 'https://example.com/a',
    })

    expect(addUrlToCustomProject).toHaveBeenCalledWith(
      'project-1',
      'https://example.com/a',
      'Example',
      undefined,
    )
  })

  it('notes / category があれば options にまとめて port へ伝搬する', async () => {
    const { commandService, addUrlToCustomProject } = buildCommandService()
    const useCase = createAddUrlToCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      category: 'Inbox',
      notes: 'memo',
      projectId: 'project-1',
      title: 'Example',
      url: 'https://example.com/a',
    })

    expect(addUrlToCustomProject).toHaveBeenCalledWith(
      'project-1',
      'https://example.com/a',
      'Example',
      { category: 'Inbox', notes: 'memo' },
    )
  })
})
