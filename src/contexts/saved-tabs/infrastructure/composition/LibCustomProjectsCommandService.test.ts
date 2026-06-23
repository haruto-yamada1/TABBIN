import { beforeEach, describe, expect, it, vi } from 'vitest'

const projectStorage = vi.hoisted(() => ({
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
  updateProjectKeywords: vi.fn(),
}))

vi.mock('@/lib/storage/projects', () => projectStorage)

import { createLibCustomProjectsCommandService } from './LibCustomProjectsCommandService'

describe('createLibCustomProjectsCommandService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('すべての command を lib/storage/projects へ引数ごと委譲する', async () => {
    const service = createLibCustomProjectsCommandService()
    const addOptions = { category: 'Docs', notes: 'memo' }
    const removeOptions = { throwOnError: true }
    const keywords = {
      domainKeywords: ['example'],
      titleKeywords: ['Docs'],
      urlKeywords: ['reference'],
    }

    await service.addCategoryToProject('project-1', 'Docs')
    await service.addUrlToCustomProject(
      'project-1',
      'https://example.com',
      'Example',
      addOptions,
    )
    await service.moveUrlBetweenCustomProjects(
      'project-1',
      'project-2',
      'https://example.com',
    )
    await service.removeCategoryFromProject('project-1', 'Docs')
    await service.removeUrlFromCustomProject('project-1', 'https://example.com')
    await service.removeUrlIdsFromAllCustomProjects(['url-1'], removeOptions)
    await service.removeUrlsFromAllCustomProjects(
      ['https://example.com'],
      removeOptions,
    )
    await service.removeUrlsFromCustomProject('project-1', [
      'https://example.com',
    ])
    await service.renameCategoryInProject('project-1', 'Docs', 'Reference')
    await service.reorderProjectUrls('project-1', [])
    await service.setUrlCategory('project-1', 'https://example.com', 'Docs')
    await service.updateCategoryOrder('project-1', ['Docs'])
    await service.updateProjectKeywords('project-1', keywords)

    expect(projectStorage.addCategoryToProject).toHaveBeenCalledWith(
      'project-1',
      'Docs',
    )
    expect(projectStorage.addUrlToCustomProject).toHaveBeenCalledWith(
      'project-1',
      'https://example.com',
      'Example',
      addOptions,
    )
    expect(projectStorage.moveUrlBetweenCustomProjects).toHaveBeenCalledWith(
      'project-1',
      'project-2',
      'https://example.com',
    )
    expect(projectStorage.removeCategoryFromProject).toHaveBeenCalledWith(
      'project-1',
      'Docs',
    )
    expect(projectStorage.removeUrlFromCustomProject).toHaveBeenCalledWith(
      'project-1',
      'https://example.com',
    )
    expect(
      projectStorage.removeUrlIdsFromAllCustomProjects,
    ).toHaveBeenCalledWith(['url-1'], removeOptions)
    expect(projectStorage.removeUrlsFromAllCustomProjects).toHaveBeenCalledWith(
      ['https://example.com'],
      removeOptions,
    )
    expect(projectStorage.removeUrlsFromCustomProject).toHaveBeenCalledWith(
      'project-1',
      ['https://example.com'],
    )
    expect(projectStorage.renameCategoryInProject).toHaveBeenCalledWith(
      'project-1',
      'Docs',
      'Reference',
    )
    expect(projectStorage.reorderProjectUrls).toHaveBeenCalledWith(
      'project-1',
      [],
    )
    expect(projectStorage.setUrlCategory).toHaveBeenCalledWith(
      'project-1',
      'https://example.com',
      'Docs',
    )
    expect(projectStorage.updateCategoryOrder).toHaveBeenCalledWith(
      'project-1',
      ['Docs'],
    )
    expect(projectStorage.updateProjectKeywords).toHaveBeenCalledWith(
      'project-1',
      keywords,
    )
  })
})
