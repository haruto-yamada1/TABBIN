import { describe, expect, it, vi } from 'vitest'

import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import type { DeleteSelectedSavedUrlsUseCaseDeps } from './DeleteSelectedSavedUrlsUseCase'
import { createDeleteSelectedSavedUrlsUseCase } from './DeleteSelectedSavedUrlsUseCase'

const createFixture = (
  initial: {
    tabGroups?: ReturnType<typeof createTabGroup>[]
    urlRecords?: ReturnType<typeof createUrlRecord>[]
    customProjects?: ReturnType<typeof createCustomProject>[]
  } = {},
) => {
  let tabGroups = initial.tabGroups ?? [
    createTabGroup({
      domain: 'first.example',
      id: 'first',
      memberships: [{ urlId: 'a' }, { urlId: 'b' }],
    }),
    createTabGroup({
      domain: 'second.example',
      id: 'second',
      memberships: [{ urlId: 'c' }],
    }),
  ]
  let urlRecords =
    initial.urlRecords ??
    ['a', 'b', 'c'].map((id) =>
      createUrlRecord({
        id,
        savedAt: 1,
        title: id,
        url: `https://example.com/${id}`,
      }),
    )
  let customProjects = initial.customProjects ?? [
    createCustomProject({
      id: 'project',
      memberships: urlRecords.map(({ id: urlId }) => ({ urlId })),
    }),
  ]
  const deps: DeleteSelectedSavedUrlsUseCaseDeps = {
    parentCategoryRepository: {
      findAll: vi.fn(async () => []),
      findById: async () => null,
      saveAll: vi.fn(),
      removeByIds: vi.fn(),
    },
    tabGroupRepository: {
      findAll: vi.fn(async () => [...tabGroups]),
      findById: async (id) =>
        tabGroups.find((group) => group.id === id) ?? null,
      findRawDomainById: async () => null,
      findRawTabGroupById: async () => null,
      removeByIds: vi.fn(),
      saveAll: vi.fn(async (next) => {
        tabGroups = [...next]
      }),
    },
    urlRecordRepository: {
      findAll: vi.fn(async () => [...urlRecords]),
      findById: async (id) =>
        urlRecords.find((record) => record.id === id) ?? null,
      removeByIds: vi.fn(async (ids) => {
        urlRecords = urlRecords.filter(({ id }) => !ids.includes(id))
      }),
      saveAll: vi.fn(),
    },
    customProjectRepository: {
      findAll: vi.fn(async () => [...customProjects]),
      findById: async (id) =>
        customProjects.find((project) => project.id === id) ?? null,
      findOrder: vi.fn(async () => customProjects.map(({ id }) => id)),
      removeByIds: vi.fn(),
      saveAll: vi.fn(async (next) => {
        customProjects = [...next]
      }),
      saveOrder: vi.fn(),
    },
  }
  return { deps, useCase: createDeleteSelectedSavedUrlsUseCase(deps) }
}

describe('DeleteSelectedSavedUrlsUseCase', () => {
  it('reads each collection once and saves each changed aggregate once for 100 selected domains', async () => {
    const urlRecords = Array.from({ length: 100 }, (_, index) =>
      createUrlRecord({
        id: `url-${index}`,
        savedAt: index,
        title: `Title ${index}`,
        url: `https://example.com/${index}`,
      }),
    )
    const tabGroups = urlRecords.map(({ id: urlId }, index) =>
      createTabGroup({
        domain: `domain-${index}.example`,
        id: `group-${index}`,
        memberships: [{ urlId }],
      }),
    )
    const { deps, useCase } = createFixture({ tabGroups, urlRecords })

    const result = await useCase({
      targets: urlRecords.map(({ url }, index) => ({
        tabGroupId: `group-${index}`,
        urls: [url],
      })),
    })

    expect(result.removedCount).toBe(100)
    expect(result.snapshot?.savedTabs).toHaveLength(100)
    expect(deps.tabGroupRepository.findAll).toHaveBeenCalledTimes(1)
    expect(deps.urlRecordRepository.findAll).toHaveBeenCalledTimes(1)
    expect(deps.customProjectRepository.findAll).toHaveBeenCalledTimes(1)
    expect(deps.customProjectRepository.findOrder).toHaveBeenCalledTimes(1)
    expect(deps.parentCategoryRepository.findAll).toHaveBeenCalledTimes(1)
    expect(deps.tabGroupRepository.saveAll).toHaveBeenCalledTimes(1)
    expect(deps.customProjectRepository.saveAll).toHaveBeenCalledTimes(1)
    expect(deps.urlRecordRepository.removeByIds).toHaveBeenCalledTimes(1)
    expect(await deps.tabGroupRepository.findAll()).toEqual([])
    expect(await deps.urlRecordRepository.findAll()).toEqual([])
    expect(await deps.customProjectRepository.findAll()).toMatchObject([
      { memberships: [] },
    ])
  })

  it('deletes only selected memberships across groups and preserves the existing custom-project cascade', async () => {
    const { deps, useCase } = createFixture()

    const result = await useCase({
      targets: [
        { tabGroupId: 'first', urls: ['https://example.com/a'] },
        { tabGroupId: 'second', urls: ['https://example.com/c'] },
      ],
    })
    expect(result.removedCount).toBe(2)
    expect(result.snapshot).toMatchObject({
      customProjectOrder: ['project'],
      savedTabs: [
        { id: 'first', memberships: [{ urlId: 'a' }, { urlId: 'b' }] },
        { id: 'second', memberships: [{ urlId: 'c' }] },
      ],
      urlRecords: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      parentCategories: [],
    })

    expect(await deps.tabGroupRepository.findAll()).toMatchObject([
      { id: 'first', memberships: [{ urlId: 'b' }] },
    ])
    expect(await deps.urlRecordRepository.findAll()).toMatchObject([
      { id: 'b' },
    ])
    expect(await deps.customProjectRepository.findAll()).toMatchObject([
      { memberships: [{ urlId: 'b' }] },
    ])
  })

  it('merges repeated groups and deduplicates requested memberships before deleting an emptied group', async () => {
    const { deps, useCase } = createFixture()

    await expect(
      useCase({
        targets: [
          {
            tabGroupId: 'first',
            urls: ['https://example.com/a', 'https://example.com/a'],
          },
          { tabGroupId: 'first', urls: ['https://example.com/b'] },
        ],
      }),
    ).resolves.toMatchObject({ removedCount: 2 })
    expect(await deps.tabGroupRepository.findAll()).toMatchObject([
      { id: 'second' },
    ])
    expect(deps.tabGroupRepository.saveAll).toHaveBeenCalledTimes(1)
  })

  it('preserves another domain reference, a pre-existing orphan, and unrelated custom memberships', async () => {
    const urlRecords = ['a', 'b', 'orphan'].map((id) =>
      createUrlRecord({
        id,
        savedAt: 1,
        title: id,
        url: `https://example.com/${id}`,
      }),
    )
    const tabGroups = [
      createTabGroup({ id: 'first', memberships: [{ urlId: 'a' }] }),
      createTabGroup({
        id: 'second',
        memberships: [{ urlId: 'a' }, { urlId: 'b' }],
      }),
    ]
    const unchangedProject = createCustomProject({
      id: 'unrelated',
      memberships: [{ urlId: 'b', notes: 'Keep my notes' }],
    })
    const { deps, useCase } = createFixture({
      tabGroups,
      urlRecords,
      customProjects: [unchangedProject],
    })

    const result = await useCase({
      targets: [{ tabGroupId: 'first', urls: ['https://example.com/a'] }],
    })

    expect(result.removedCount).toBe(1)
    expect(await deps.tabGroupRepository.findAll()).toEqual([tabGroups[1]])
    expect(await deps.urlRecordRepository.findAll()).toEqual(urlRecords)
    expect(deps.urlRecordRepository.removeByIds).not.toHaveBeenCalled()
    expect(await deps.customProjectRepository.findAll()).toEqual([
      unchangedProject,
    ])
    expect(deps.customProjectRepository.saveAll).not.toHaveBeenCalled()
  })

  it('counts two selected memberships for a shared URL but removes the unreferenced record only once', async () => {
    const tabGroups = ['first', 'second'].map((id) =>
      createTabGroup({ id, memberships: [{ urlId: 'a' }] }),
    )
    const record = createUrlRecord({
      id: 'a',
      savedAt: 1,
      title: 'A',
      url: 'https://example.com/a',
    })
    const { deps, useCase } = createFixture({ tabGroups, urlRecords: [record] })

    const result = await useCase({
      targets: tabGroups.map(({ id: tabGroupId }) => ({
        tabGroupId,
        urls: [record.url],
      })),
    })

    expect(result.removedCount).toBe(2)
    expect(await deps.tabGroupRepository.findAll()).toEqual([])
    expect(await deps.urlRecordRepository.findAll()).toEqual([])
    expect(
      deps.urlRecordRepository.removeByIds,
    ).toHaveBeenCalledExactlyOnceWith([record.id])
  })

  it.each([
    [
      'missing group',
      'missing',
      ['https://example.com/c'],
      'TAB_GROUP_NOT_FOUND',
    ],
    [
      'missing URL',
      'second',
      ['https://example.com/missing'],
      'URL_RECORD_NOT_FOUND',
    ],
    [
      'foreign URL',
      'second',
      ['https://example.com/c', 'https://example.com/b'],
      'URL_RECORD_NOT_FOUND',
    ],
  ])(
    'rejects %s before mutating any earlier valid target',
    async (_name, tabGroupId, urls, code) => {
      const { deps, useCase } = createFixture()
      const original = await deps.tabGroupRepository.findAll()

      await expect(
        useCase({
          targets: [
            { tabGroupId: 'first', urls: ['https://example.com/a'] },
            { tabGroupId, urls },
          ],
        }),
      ).rejects.toMatchObject({ code })
      expect(await deps.tabGroupRepository.findAll()).toEqual(original)
      expect(deps.tabGroupRepository.saveAll).not.toHaveBeenCalled()
      expect(deps.customProjectRepository.saveAll).not.toHaveBeenCalled()
      expect(deps.urlRecordRepository.removeByIds).not.toHaveBeenCalled()
    },
  )

  it.each([
    { targets: [] },
    { targets: [{ tabGroupId: 'missing', urls: [] }] },
  ])(
    'does not read or mutate repositories for an empty selection',
    async ({ targets }) => {
      const { deps, useCase } = createFixture()

      await expect(useCase({ targets })).resolves.toEqual({
        removedCount: 0,
        snapshot: null,
      })
      expect(deps.tabGroupRepository.findAll).not.toHaveBeenCalled()
      expect(deps.urlRecordRepository.findAll).not.toHaveBeenCalled()
    },
  )
})
