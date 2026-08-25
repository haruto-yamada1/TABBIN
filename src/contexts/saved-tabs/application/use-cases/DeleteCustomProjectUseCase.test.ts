import { describe, expect, it, vi } from 'vitest'

import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import { createCustomProject } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createDeleteCustomProjectUseCase } from './DeleteCustomProjectUseCase'

const createRepository = (initial: readonly CustomProject[]) => {
  let projects = [...initial]
  const saveAll = vi.fn(async (next: readonly CustomProject[]) => {
    projects = [...next]
  })
  const repository: CustomProjectRepository = {
    findAll: vi.fn(async () => projects),
    findById: vi.fn(
      async (id) => projects.find((project) => project.id === id) ?? null,
    ),
    findOrder: vi.fn(async () => []),
    removeByIds: vi.fn(async () => undefined),
    saveAll,
    saveOrder: vi.fn(async () => undefined),
  }
  return { repository, saveAll }
}

const createUseCase = (projects: readonly CustomProject[]) => {
  const { repository, saveAll } = createRepository(projects)
  return {
    run: createDeleteCustomProjectUseCase({
      clock: { now: () => 100 },
      customProjectRepository: repository,
      uncategorizedProjectId: 'custom-uncategorized',
    }),
    saveAll,
  }
}

describe('DeleteCustomProjectUseCase', () => {
  it('対象projectのmembershipを既存の未分類collectionへ移す', async () => {
    const target = createCustomProject({
      id: 'target',
      memberships: [{ urlId: 'url-1' }, { urlId: 'url-2' }],
      name: 'Target',
      updatedAt: 20,
    })
    const uncategorized = createCustomProject({
      id: 'custom-uncategorized',
      memberships: [{ urlId: 'url-1' }, { urlId: 'url-3' }],
      name: '未分類',
      updatedAt: 10,
    })
    const { run, saveAll } = createUseCase([target, uncategorized])

    const result = await run({ projectId: 'target' })

    expect(result.all).toHaveLength(1)
    expect(result.all[0]?.memberships.map(({ urlId }) => urlId)).toEqual([
      'url-1',
      'url-3',
      'url-2',
    ])
    expect(result.all[0]?.memberships[2]).toMatchObject({
      collectionId: 'custom-uncategorized',
      sortOrder: 2,
    })
    expect(saveAll).toHaveBeenCalledOnce()
  })

  it('未分類collectionが無ければcurrent projectionで生成する', async () => {
    const target = createCustomProject({
      id: 'target',
      memberships: [{ urlId: 'url-1' }],
      name: 'Target',
    })
    const { run } = createUseCase([target])

    const result = await run({ projectId: 'target' })

    expect(result.all).toHaveLength(1)
    expect(result.all[0]).toMatchObject({
      collection: {
        definition: { type: 'custom' },
        id: 'custom-uncategorized',
        name: '未分類',
      },
      collectionCategories: [],
    })
    expect(result.all[0]?.memberships[0]).toMatchObject({
      collectionId: 'custom-uncategorized',
      urlId: 'url-1',
    })
  })

  it('未分類collection自身の削除を拒否する', async () => {
    const { run } = createUseCase([])
    await expect(
      run({ projectId: 'custom-uncategorized' }),
    ).rejects.toMatchObject({ code: 'INVALID_CUSTOM_PROJECT' })
  })

  it('存在しないprojectの削除を拒否する', async () => {
    const { run } = createUseCase([])
    await expect(run({ projectId: 'missing' })).rejects.toMatchObject({
      code: 'INVALID_CUSTOM_PROJECT',
    })
  })
})
