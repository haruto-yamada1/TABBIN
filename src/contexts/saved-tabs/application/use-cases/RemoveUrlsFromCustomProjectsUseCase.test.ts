import { describe, expect, it, vi } from 'vitest'

import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { createRemoveUrlsFromCustomProjectsUseCase } from './RemoveUrlsFromCustomProjectsUseCase'

const createDeps = () => {
  const removeUrlIdsFromAllCustomProjects = vi.fn(async () => {})
  const removeUrlsFromAllCustomProjects = vi.fn(async () => {})
  const commandService = {
    removeUrlIdsFromAllCustomProjects,
    removeUrlsFromAllCustomProjects,
  } as unknown as CustomProjectsCommandService
  const loadTabGroupUrls = vi.fn(async () => ({ urls: [] }))
  return {
    deps: {
      customProjectsCommandService: commandService,
      loadTabGroupUrls,
    },
    loadTabGroupUrls,
    removeUrlIdsFromAllCustomProjects,
    removeUrlsFromAllCustomProjects,
  }
}

describe('RemoveUrlsFromCustomProjectsUseCase', () => {
  it('current membershipsのURL IDをdedupeして一括削除する', async () => {
    const mocks = createDeps()
    const useCase = createRemoveUrlsFromCustomProjectsUseCase(mocks.deps)

    const result = await useCase({
      tabGroups: [
        createTabGroup({
          id: 'group-a',
          memberships: [{ urlId: 'url-1' }, { urlId: 'url-2' }],
        }),
        createTabGroup({
          id: 'group-b',
          memberships: [{ urlId: 'url-2' }, { urlId: 'url-3' }],
        }),
      ],
    })

    expect(mocks.removeUrlIdsFromAllCustomProjects).toHaveBeenCalledWith(
      ['url-1', 'url-2', 'url-3'],
      { throwOnError: true },
    )
    expect(result).toStrictEqual({ removedUrlCount: 0, removedUrlIdCount: 3 })
  })

  it('membershipが空なら削除portを呼ばない', async () => {
    const mocks = createDeps()
    const useCase = createRemoveUrlsFromCustomProjectsUseCase(mocks.deps)

    await expect(
      useCase({ tabGroups: [createTabGroup({ id: 'group-empty' })] }),
    ).resolves.toStrictEqual({ removedUrlCount: 0, removedUrlIdCount: 0 })
    expect(mocks.removeUrlIdsFromAllCustomProjects).not.toHaveBeenCalled()
  })

  it('URL文字列へのsilent fallbackとdual writeを行わない', async () => {
    const mocks = createDeps()
    const useCase = createRemoveUrlsFromCustomProjectsUseCase(mocks.deps)

    await useCase({
      tabGroups: [
        createTabGroup({
          id: 'group-1',
          memberships: [{ urlId: 'url-1' }],
        }),
      ],
    })

    expect(mocks.loadTabGroupUrls).not.toHaveBeenCalled()
    expect(mocks.removeUrlsFromAllCustomProjects).not.toHaveBeenCalled()
  })
})
