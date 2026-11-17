import { describe, expect, it, vi } from 'vitest'

import type { CustomProjectUrlDeletionServiceDeps } from '@/contexts/saved-tabs/application/services/CustomProjectUrlDeletionService'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'
import { createMockTabGroupRepository } from '@/contexts/saved-tabs/testing/createMockTabGroupRepository'

import { createRemoveUrlFromCustomProjectUseCase } from './RemoveUrlFromCustomProjectUseCase'
import { createRemoveUrlsFromCustomProjectUseCase } from './RemoveUrlsFromCustomProjectUseCase'

const createFixture = (customOnly = false) => {
  let projects = [
    createCustomProject({
      id: 'source',
      memberships: [{ urlId: 'a' }, { urlId: 'b' }],
    }),
    createCustomProject({
      id: 'other',
      memberships: [{ urlId: 'a' }, { urlId: 'c' }],
    }),
  ]
  let records = ['a', 'b', 'c'].map((id) =>
    createUrlRecord({
      id,
      savedAt: 1,
      title: id,
      url: `https://example.com/${id}`,
    }),
  )
  const deps: CustomProjectUrlDeletionServiceDeps = {
    tabGroupRepository: createMockTabGroupRepository({
      savedTabs: customOnly
        ? []
        : [
            createTabGroup({
              id: 'first',
              memberships: [{ urlId: 'a' }, { urlId: 'b' }],
            }),
            createTabGroup({ id: 'second', memberships: [{ urlId: 'a' }] }),
            createTabGroup({ id: 'unrelated', memberships: [{ urlId: 'c' }] }),
            createTabGroup({ id: 'empty', memberships: [] }),
          ],
    }),
    customProjectRepository: {
      findAll: vi.fn(async () => projects),
      findById: async (id) =>
        projects.find((project) => project.id === id) ?? null,
      findOrder: async () => projects.map(({ id }) => id),
      removeByIds: vi.fn(),
      saveAll: vi.fn(async (next) => {
        projects = [...next]
      }),
      saveOrder: vi.fn(),
    },
    urlRecordRepository: {
      findAll: vi.fn(async () => records),
      findById: async (id) =>
        records.find((record) => record.id === id) ?? null,
      saveAll: vi.fn(),
      removeByIds: vi.fn(async (ids) => {
        records = records.filter(({ id }) => !ids.includes(id))
      }),
    },
  }
  return deps
}

const removers = [
  {
    mode: 'single',
    remove: async (deps: CustomProjectUrlDeletionServiceDeps, url: string) =>
      createRemoveUrlFromCustomProjectUseCase(deps)({
        projectId: 'source',
        url,
      }),
  },
  {
    mode: 'bulk',
    remove: async (deps: CustomProjectUrlDeletionServiceDeps, url: string) =>
      createRemoveUrlsFromCustomProjectUseCase(deps)({
        projectId: 'source',
        urls: [url, url],
      }),
  },
]

describe.each(removers)('$mode custom saved-URL deletion', ({ remove }) => {
  it('removes the saved URL from every domain and project, preserving unrelated and already empty groups', async () => {
    const deps = createFixture()
    await remove(deps, 'https://example.com/a')
    expect(await deps.tabGroupRepository.findAll()).toMatchObject([
      { id: 'first', memberships: [{ urlId: 'b' }] },
      { id: 'unrelated', memberships: [{ urlId: 'c' }] },
      { id: 'empty', memberships: [] },
    ])
    expect(await deps.customProjectRepository.findAll()).toMatchObject([
      { id: 'source', memberships: [{ urlId: 'b' }] },
      { id: 'other', memberships: [{ urlId: 'c' }] },
    ])
    expect(
      (await deps.urlRecordRepository.findAll()).map(({ id }) => id),
    ).toEqual(['b', 'c'])
    expect(
      deps.urlRecordRepository.removeByIds,
    ).toHaveBeenCalledExactlyOnceWith(['a'])
  })

  it.each(['c', 'missing'])(
    'preserves all data when the requested URL %s is not a source member',
    async (id) => {
      const deps = createFixture()
      await remove(deps, `https://example.com/${id}`)
      expect(deps.tabGroupRepository.saveAll).not.toHaveBeenCalled()
      expect(deps.customProjectRepository.saveAll).not.toHaveBeenCalled()
      expect(deps.urlRecordRepository.removeByIds).not.toHaveBeenCalled()
    },
  )

  it('deletes custom-only URLs without writing domain groups', async () => {
    const deps = createFixture(true)
    await remove(deps, 'https://example.com/a')
    expect(deps.tabGroupRepository.saveAll).not.toHaveBeenCalled()
    expect(
      (await deps.urlRecordRepository.findAll()).map(({ id }) => id),
    ).toEqual(['b', 'c'])
  })

  it('propagates persistence failure instead of reporting success or deleting URL records', async () => {
    const deps = createFixture()
    const error = new Error('project save failed')
    vi.mocked(deps.customProjectRepository.saveAll).mockRejectedValue(error)
    await expect(remove(deps, 'https://example.com/a')).rejects.toBe(error)
    expect(deps.urlRecordRepository.removeByIds).not.toHaveBeenCalled()
  })
})

it('bulk deletion deduplicates targets and never deletes a foreign project URL', async () => {
  const deps = createFixture()
  await createRemoveUrlsFromCustomProjectUseCase(deps)({
    projectId: 'source',
    urls: ['a', 'b', 'a', 'c'].map((id) => `https://example.com/${id}`),
  })
  expect(
    (await deps.urlRecordRepository.findAll()).map(({ id }) => id),
  ).toEqual(['c'])
  expect(await deps.customProjectRepository.findAll()).toMatchObject([
    { id: 'source', memberships: [] },
    { id: 'other', memberships: [{ urlId: 'c' }] },
  ])
})

it('empty bulk deletion performs no reads or writes', async () => {
  const deps = createFixture()
  await createRemoveUrlsFromCustomProjectUseCase(deps)({
    projectId: 'source',
    urls: [],
  })
  expect(deps.customProjectRepository.findAll).not.toHaveBeenCalled()
  expect(deps.tabGroupRepository.saveAll).not.toHaveBeenCalled()
  expect(deps.urlRecordRepository.removeByIds).not.toHaveBeenCalled()
})
