import { describe, expect, it, vi } from 'vitest'

import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import { createCustomProject } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createRestoreCustomProjectsSnapshotUseCase } from './RestoreCustomProjectsSnapshotUseCase'

const makeRepository = (options: {
  readonly restoreAllRaw?: (
    raws: readonly CustomProjectRawSnapshot[],
  ) => Promise<void>
  readonly saveAll?: (projects: readonly CustomProject[]) => Promise<void>
  readonly saveOrder?: (order: readonly CustomProjectId[]) => Promise<void>
}): CustomProjectRepository => ({
  findAll: vi.fn(async () => []),
  findById: vi.fn(async () => null),
  findOrder: vi.fn(async () => []),
  removeByIds: vi.fn(async () => {}),
  saveAll: options.saveAll ?? vi.fn(async () => {}),
  saveOrder: options.saveOrder ?? vi.fn(async () => {}),
  ...(options.restoreAllRaw ? { restoreAllRaw: options.restoreAllRaw } : {}),
})

const projects = [
  createCustomProject({
    categories: ['Reading'],
    createdAt: 1,
    id: 'project-1',
    memberships: [{ category: 'Reading', urlId: 'url-1' }],
    name: 'Project A',
    updatedAt: 2,
  }),
]
const raws: readonly CustomProjectRawSnapshot[] = projects

describe('RestoreCustomProjectsSnapshotUseCase', () => {
  it('raw snapshotとrestoreAllRawがあればそのcurrent snapshotを復元する', async () => {
    const restoreAllRaw = vi.fn(async () => {})
    const saveAll = vi.fn(async () => {})
    const saveOrder = vi.fn(async () => {})
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      customProjectRepository: makeRepository({
        restoreAllRaw,
        saveAll,
        saveOrder,
      }),
    })

    await useCase({
      payload: {
        customProjectOrder: ['project-1'],
        customProjects: projects,
        customProjectsRaw: raws,
      },
    })

    expect(restoreAllRaw).toHaveBeenCalledWith(raws)
    expect(saveAll).not.toHaveBeenCalled()
    expect(saveOrder).toHaveBeenCalledWith(['project-1'])
  })

  it.each([
    ['snapshotなし', undefined],
    ['restore portなし', raws],
  ] as const)(
    '%sならnormalized projectsをsaveAllする',
    async (_, rawSnapshot) => {
      const saveAll = vi.fn(async () => {})
      const useCase = createRestoreCustomProjectsSnapshotUseCase({
        customProjectRepository: makeRepository({ saveAll }),
      })

      await useCase({
        payload: {
          customProjects: projects,
          ...(rawSnapshot ? { customProjectsRaw: rawSnapshot } : {}),
        },
      })

      expect(saveAll).toHaveBeenCalledWith(projects)
    },
  )

  it('order省略時は空orderを書き戻す', async () => {
    const saveOrder = vi.fn(async () => {})
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      customProjectRepository: makeRepository({ saveOrder }),
    })

    await useCase({ payload: { customProjects: projects } })

    expect(saveOrder).toHaveBeenCalledWith([])
  })

  it('空membershipをそのままcurrent projectとして保存する', async () => {
    const saveAll = vi.fn(async () => {})
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      customProjectRepository: makeRepository({ saveAll }),
    })
    const emptyProject = createCustomProject({ id: 'project-empty' })

    await useCase({ payload: { customProjects: [emptyProject] } })

    expect(saveAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'project-empty', memberships: [] }),
    ])
  })
})
