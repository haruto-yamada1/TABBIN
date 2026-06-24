import { describe, expect, it, vi } from 'vitest'

import { toSavedTabsTabGroupDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'

import type { ReorderTabGroupsUseCaseDeps } from './ReorderTabGroupsUseCase'
import { createReorderTabGroupsUseCase } from './ReorderTabGroupsUseCase'

interface Repositories extends ReorderTabGroupsUseCaseDeps {
  tabGroups: ReturnType<typeof createTabGroup>[]
  saveAllSpy: ReturnType<typeof vi.fn>
}

const createInMemoryRepositories = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
  } = {},
): Repositories => {
  const tabGroups: ReturnType<typeof createTabGroup>[] = [
    ...(initial.tabGroups ?? []),
  ]
  const saveAllSpy = vi.fn(
    async (groups: readonly ReturnType<typeof createTabGroup>[]) => {
      tabGroups.splice(0, tabGroups.length, ...groups)
    },
  )
  const tabGroupRepository: TabGroupRepository = {
    findAll: async () => [...tabGroups],

    findById: async (id) => tabGroups.find((group) => group.id === id) ?? null,
    findRawDomainById: vi.fn(async () => null),
    findRawTabGroupById: vi.fn(async () => null),

    removeByIds: async () => undefined,
    saveAll: saveAllSpy,
  }
  return {
    saveAllSpy,
    tabGroupRepository,
    tabGroups,
  }
}

describe('ReorderTabGroupsUseCase', () => {
  it('指定された順序で TabGroup を repository へ保存する', async () => {
    const first = createTabGroup({
      domain: 'first.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    const second = createTabGroup({
      domain: 'second.com',
      id: 'group-2',
      urlIds: ['url-2'],
    })
    const third = createTabGroup({
      domain: 'third.com',
      id: 'group-3',
      urlIds: ['url-3'],
    })
    const repositories = createInMemoryRepositories({
      tabGroups: [first, second, third],
    })
    const useCase = createReorderTabGroupsUseCase(repositories)

    await useCase({
      tabGroups: [third, first, second].map(toSavedTabsTabGroupDto),
    })

    expect(repositories.saveAllSpy).toHaveBeenCalledTimes(1)
    expect(repositories.saveAllSpy).toHaveBeenCalledWith([third, first, second])
    expect(repositories.tabGroups.map((group) => group.id)).toStrictEqual([
      'group-3',
      'group-1',
      'group-2',
    ])
  })

  it('空配列を渡された場合は repository へ空配列を保存する', async () => {
    const repositories = createInMemoryRepositories({
      tabGroups: [
        createTabGroup({
          domain: 'a.com',
          id: 'group-1',
          urlIds: ['url-1'],
        }),
      ],
    })
    const useCase = createReorderTabGroupsUseCase(repositories)

    await useCase({ tabGroups: [] })

    expect(repositories.saveAllSpy).toHaveBeenCalledWith([])
    expect(repositories.tabGroups).toStrictEqual([])
  })
})
