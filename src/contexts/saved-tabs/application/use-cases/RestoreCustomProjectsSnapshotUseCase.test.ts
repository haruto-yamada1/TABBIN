import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'

import { createRestoreCustomProjectsSnapshotUseCase } from './RestoreCustomProjectsSnapshotUseCase'

const makeRepository = (options: {
  readonly restoreAllRaw?: (
    raws: readonly CustomProjectRawSnapshot[],
  ) => Promise<void>
  readonly saveAll?: (projects: readonly CustomProject[]) => Promise<void>
  readonly saveOrder?: (order: readonly CustomProjectId[]) => Promise<void>
}): CustomProjectRepository =>
  ({
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    removeByIds: vi.fn().mockResolvedValue(undefined),
    saveAll: options.saveAll ?? vi.fn().mockResolvedValue(undefined),
    findOrder: vi.fn().mockResolvedValue([]),
    saveOrder: options.saveOrder ?? vi.fn().mockResolvedValue(undefined),
    ...(options.restoreAllRaw ? { restoreAllRaw: options.restoreAllRaw } : {}),
  }) as unknown as CustomProjectRepository

describe('RestoreCustomProjectsSnapshotUseCase', () => {
  const projects: CustomProject[] = [
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      id: 'project-1' as never,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      name: 'Project A' as never,
      categories: [],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      createdAt: 1 as never,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      updatedAt: 2 as never,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      urlIds: ['url-a' as never],
    },
  ]
  const raws: CustomProjectRawSnapshot[] = [
    {
      categories: [],
      createdAt: 1,
      id: 'project-1',
      name: 'Q4',
      updatedAt: 2,
      urlIds: ['url-1'],
      urls: [{ url: 'https://example.com/a', title: 'A' }],
    },
  ]
  const order: CustomProjectId[] = ['project-1' as never]

  it('payload に raw snapshot があり restoreAllRaw が実装されていれば restoreAllRaw 経由で書き戻す', async () => {
    const restoreAllRaw = vi.fn().mockResolvedValue(undefined)
    const saveAll = vi.fn().mockResolvedValue(undefined)
    const saveOrder = vi.fn().mockResolvedValue(undefined)
    const customProjectRepository = makeRepository({
      restoreAllRaw,
      saveAll,
      saveOrder,
    })
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      customProjectRepository,
    })

    await useCase({
      payload: {
        customProjects: projects,
        customProjectsRaw: raws,
        customProjectOrder: order,
      },
    })

    expect(restoreAllRaw).toHaveBeenCalledWith(raws)
    // restoreAllRaw 経路では saveAll は呼ばれない。
    expect(saveAll).not.toHaveBeenCalled()
    expect(saveOrder).toHaveBeenCalledWith(order)
  })

  it('payload に customProjectsRaw が無い場合、saveAll へフォールバックする (issue #535 P1 / PR #506 review P2)', async () => {
    const saveAll = vi.fn().mockResolvedValue(undefined)
    const saveOrder = vi.fn().mockResolvedValue(undefined)
    const restoreAllRaw = vi.fn().mockResolvedValue(undefined)
    const customProjectRepository = makeRepository({
      restoreAllRaw,
      saveAll,
      saveOrder,
    })
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      customProjectRepository,
    })

    await useCase({
      payload: {
        customProjects: projects,
        customProjectOrder: order,
      },
    })

    expect(saveAll).toHaveBeenCalledWith(projects)
    expect(restoreAllRaw).not.toHaveBeenCalled()
    expect(saveOrder).toHaveBeenCalledWith(order)
  })

  it('restoreAllRaw が repository に未実装の場合、saveAll へフォールバックする (旧 mock / legacy 経路)', async () => {
    const saveAll = vi.fn().mockResolvedValue(undefined)
    const saveOrder = vi.fn().mockResolvedValue(undefined)
    const customProjectRepository = makeRepository({
      saveAll,
      saveOrder,
    })
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      customProjectRepository,
    })

    await useCase({
      payload: {
        customProjects: projects,
        customProjectsRaw: raws,
        customProjectOrder: order,
      },
    })

    expect(saveAll).toHaveBeenCalledWith(projects)
    expect(saveOrder).toHaveBeenCalledWith(order)
  })

  it('customProjectOrder が省略された payload は saveOrder([]) 相当の「全消去」セマンティクスで書き戻す', async () => {
    const saveOrder = vi.fn().mockResolvedValue(undefined)
    const customProjectRepository = makeRepository({ saveOrder })
    const useCase = createRestoreCustomProjectsSnapshotUseCase({
      customProjectRepository,
    })

    await useCase({
      payload: {
        customProjects: projects,
      },
    })

    expect(saveOrder).toHaveBeenCalledWith([])
  })
})
