import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import { createRemoveUrlsFromCustomProjectUseCase } from './RemoveUrlsFromCustomProjectUseCase'

const buildCommandService = (): {
  commandService: CustomProjectsCommandService
  removeUrlsFromCustomProject: ReturnType<typeof vi.fn>
} => {
  const removeUrlsFromCustomProject = vi.fn(async () => undefined)
  const commandService = {
    addCategoryToProject: vi.fn(),
    addUrlToCustomProject: vi.fn(),
    moveUrlBetweenCustomProjects: vi.fn(),
    removeCategoryFromProject: vi.fn(),
    removeUrlFromCustomProject: vi.fn(),
    removeUrlIdsFromAllCustomProjects: vi.fn(),
    removeUrlsFromAllCustomProjects: vi.fn(),
    removeUrlsFromCustomProject,
    renameCategoryInProject: vi.fn(),
    reorderProjectUrls: vi.fn(),
    setUrlCategory: vi.fn(),
    updateCategoryOrder: vi.fn(),
    updateProjectKeywords: vi.fn(),
  }
  return {
    commandService: commandService as unknown as CustomProjectsCommandService,
    removeUrlsFromCustomProject,
  }
}

describe('RemoveUrlsFromCustomProjectUseCase', () => {
  it('port の removeUrlsFromCustomProject を projectId / urls で呼び出す (readonly を mutable へ widen)', async () => {
    const { commandService, removeUrlsFromCustomProject } =
      buildCommandService()
    const useCase = createRemoveUrlsFromCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({
      projectId: 'project-1',
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    expect(removeUrlsFromCustomProject).toHaveBeenCalledWith('project-1', [
      'https://example.com/a',
      'https://example.com/b',
    ])
  })

  it('urls が空配列でも port へ空配列を渡す (port 側で no-op 判定)', async () => {
    const { commandService, removeUrlsFromCustomProject } =
      buildCommandService()
    const useCase = createRemoveUrlsFromCustomProjectUseCase({
      customProjectsCommandService: commandService,
    })

    await useCase({ projectId: 'project-1', urls: [] })

    expect(removeUrlsFromCustomProject).toHaveBeenCalledWith('project-1', [])
  })
})
