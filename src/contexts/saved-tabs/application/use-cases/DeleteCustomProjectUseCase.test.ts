import { beforeEach, describe, expect, it } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import type { CustomProject } from '../../domain/entities/CustomProject'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '../../domain/repositories/CustomProjectRepository'
import { createCustomProjectId } from '../../domain/value-objects/CustomProjectId'
import { createDeleteCustomProjectUseCase } from './DeleteCustomProjectUseCase'
import type { DeleteCustomProjectUseCaseDeps } from './DeleteCustomProjectUseCase'

const createInMemoryRepository = (
  initial: CustomProject[] = [],
  initialRaw: CustomProjectRawSnapshot[] = [],
): CustomProjectRepository => {
  let store: CustomProject[] = [...initial]
  const rawStore: CustomProjectRawSnapshot[] = [...initialRaw]
  return {
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    findAll: async () => store.map((project) => ({ ...project })),
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    findById: async (id) => store.find((project) => project.id === id) ?? null,
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    saveAll: async (projects) => {
      store = projects.map((project) => ({ ...project }))
    },
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      store = store.filter((project) => !idSet.has(project.id))
    },
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    findOrder: async () => store.map((project) => project.id),
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    saveOrder: async () => undefined,
    // eslint-disable-next-line @typescript-eslint/require-await, typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    findAllRaw: async () => rawStore.map((raw) => ({ ...raw })),
  }
}

const baseTimestamp = 1_700_000_000_000
const createDeps = (
  repo: CustomProjectRepository,
): DeleteCustomProjectUseCaseDeps => ({
  customProjectRepository: repo,
  uncategorizedProjectId: 'custom-uncategorized',
})

describe('createDeleteCustomProjectUseCase', () => {
  let repo: CustomProjectRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createCustomProject({
        categories: [],
        createdAt: baseTimestamp,
        id: 'project-1',
        name: 'Project 1',
        updatedAt: baseTimestamp,
        urlIds: ['url-1', 'url-2'],
      }),
      createCustomProject({
        categories: [],
        createdAt: baseTimestamp,
        id: 'custom-uncategorized',
        name: '未分類',
        updatedAt: baseTimestamp,
        urlIds: ['existing-url'],
      }),
    ])
  })

  it('対象プロジェクトを削除し、URL を未分類プロジェクトへマージする', async () => {
    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    const result = await useCase({
      projectId: createCustomProjectId('project-1'),
    })
    expect(result.all.map((p) => p.id)).toStrictEqual(['custom-uncategorized'])
    const uncategorized = result.all[0]
    expect(uncategorized?.urlIds).toStrictEqual([
      'existing-url',
      'url-1',
      'url-2',
    ])
  })

  it('未分類プロジェクトが storage に無い場合、新規作成して URL を保持する (Codex review P1)', async () => {
    // uncategorized を含まない状態を作る (P1 のバグが顕在化するシナリオ)
    repo = createInMemoryRepository([
      createCustomProject({
        categories: [],
        createdAt: baseTimestamp,
        id: 'project-1',
        name: 'Project 1',
        updatedAt: baseTimestamp,
        urlIds: ['url-1', 'url-2'],
      }),
    ])

    const useCase = createDeleteCustomProjectUseCase({
      ...createDeps(repo),
      now: () => baseTimestamp,
    })
    const result = await useCase({
      projectId: createCustomProjectId('project-1'),
    })

    // target プロジェクトが消えている
    expect(result.all.map((p) => p.id)).toStrictEqual(['custom-uncategorized'])
    // 新規作成された uncategorized に target の URL が保持されている
    const uncategorized = result.all[0]
    expect(uncategorized?.urlIds).toStrictEqual(['url-1', 'url-2'])
    expect(uncategorized?.name).toBe('未分類')
  })

  it('未分類プロジェクト自身を削除しようとすると SavedTabsDomainError を投げる', async () => {
    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await expect(
      useCase({ projectId: createCustomProjectId('custom-uncategorized') }),
    ).rejects.toThrow(SavedTabsDomainError)
  })

  it('存在しないプロジェクト ID を指定すると SavedTabsDomainError を投げる', async () => {
    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await expect(
      useCase({ projectId: createCustomProjectId('missing') }),
    ).rejects.toThrow(SavedTabsDomainError)
  })
})
