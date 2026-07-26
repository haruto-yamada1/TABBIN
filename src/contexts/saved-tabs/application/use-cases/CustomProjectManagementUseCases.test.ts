import { describe, expect, it, vi } from 'vitest'

import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

import { createCreateCustomProjectUseCase } from './CreateCustomProjectUseCase'
import { createSaveCustomProjectOrderUseCase } from './SaveCustomProjectOrderUseCase'
import { createSaveCustomProjectsUseCase } from './SaveCustomProjectsUseCase'
import { createUpdateCustomProjectNameUseCase } from './UpdateCustomProjectNameUseCase'

const createRepository = (
  initial: readonly ReturnType<typeof createCustomProject>[] = [],
): CustomProjectRepository => {
  let projects = [...initial]
  return {
    findAll: vi.fn(async () => projects),
    findById: vi.fn(
      async (id) => projects.find((project) => project.id === id) ?? null,
    ),
    findOrder: vi.fn(async () => []),
    removeByIds: vi.fn(async () => {}),
    saveAll: vi.fn(async (next) => {
      projects = [...next]
    }),
    saveOrder: vi.fn(async () => {}),
  }
}

const existingProject = () =>
  createCustomProject({
    categories: ['Docs'],
    createdAt: 1,
    id: 'project-1',
    name: 'Existing',
    updatedAt: 2,
    urlIds: ['url-1'],
  })

describe('custom project management use-cases', () => {
  it('projectを生成しapplication DTOで返す', async () => {
    const customProjectRepository = createRepository([existingProject()])
    const createProject = createCreateCustomProjectUseCase({
      customProjectRepository,
      idGenerator: { generate: () => 'project-2' },
      clock: { now: () => 10 },
    })

    const result = await createProject({ name: '  Reading  ' })

    expect(result.project).toStrictEqual({
      categories: [],
      createdAt: 10,
      id: 'project-2',
      name: 'Reading',
      updatedAt: 10,
      urlIds: [],
    })
    expect(result.all).toHaveLength(2)
    expect(customProjectRepository.saveAll).toHaveBeenCalledOnce()
  })

  it('port 経由のID生成でprojectを生成できる', async () => {
    const customProjectRepository = createRepository()
    const createProject = createCreateCustomProjectUseCase({
      clock: { now: () => 1_700_000_000_000 },
      customProjectRepository,
      idGenerator: { generate: () => 'generated-id' },
    })

    const result = await createProject({ name: 'Generated' })

    expect(result.project.id).toBe('generated-id')
    expect(result.project.createdAt).toBe(1_700_000_000_000)
  })

  it.each([
    ['', 'DUPLICATE_PROJECT_NAME:'],
    [' existing ', 'DUPLICATE_PROJECT_NAME:existing'],
  ])('空名と重複名を拒否する: %s', async (name, message) => {
    const customProjectRepository = createRepository([existingProject()])
    const createProject = createCreateCustomProjectUseCase({
      clock: { now: () => 0 },
      customProjectRepository,
      idGenerator: { generate: () => 'test-id' },
    })

    await expect(createProject({ name })).rejects.toThrow(message)
    expect(customProjectRepository.saveAll).not.toHaveBeenCalled()
  })

  it('project名を更新し他projectを保持する', async () => {
    const other = createCustomProject({
      categories: [],
      createdAt: 1,
      id: 'project-2',
      name: 'Other',
      updatedAt: 1,
      urlIds: [],
    })
    const customProjectRepository = createRepository([existingProject(), other])
    const updateName = createUpdateCustomProjectNameUseCase({
      customProjectRepository,
      clock: { now: () => 20 },
    })

    const result = await updateName({
      newName: ' Renamed ',
      projectId: 'project-1',
    })

    expect(result.project).toMatchObject({
      id: 'project-1',
      name: 'Renamed',
      updatedAt: 20,
    })
    expect(result.all[1]).toMatchObject({ id: 'project-2', name: 'Other' })
  })

  it.each([
    ['', 'project-1', 'DUPLICATE_PROJECT_NAME:'],
    [' other ', 'project-1', 'DUPLICATE_PROJECT_NAME:other'],
    ['Name', 'missing', 'Project with ID missing not found'],
  ])('不正な名称更新を拒否する', async (newName, projectId, message) => {
    const other = createCustomProject({
      categories: [],
      createdAt: 1,
      id: 'project-2',
      name: 'Other',
      updatedAt: 1,
      urlIds: [],
    })
    const customProjectRepository = createRepository([existingProject(), other])
    const updateName = createUpdateCustomProjectNameUseCase({
      clock: { now: () => 0 },
      customProjectRepository,
    })

    await expect(updateName({ newName, projectId })).rejects.toThrow(message)
  })

  it('application DTOをdomain entityへ変換して保存する', async () => {
    const customProjectRepository = createRepository()
    const saveProjects = createSaveCustomProjectsUseCase({
      customProjectRepository,
    })

    await saveProjects({
      projects: [
        {
          categories: ['Docs'],
          createdAt: 1,
          id: 'project-1',
          name: 'Saved',
          updatedAt: 2,
          urlIds: ['url-1'],
        },
      ],
    })

    expect(customProjectRepository.saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'project-1', name: 'Saved' }),
    ])
  })

  it('project order を repository へ保存する', async () => {
    const customProjectRepository = createRepository()
    const saveOrder = createSaveCustomProjectOrderUseCase({
      customProjectRepository,
    })

    await saveOrder({ newOrder: ['project-2', 'project-1'] })

    expect(customProjectRepository.saveOrder).toHaveBeenCalledWith([
      'project-2',
      'project-1',
    ])
  })
})
