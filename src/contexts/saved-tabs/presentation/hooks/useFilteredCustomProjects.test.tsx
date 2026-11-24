import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  GetProjectSearchUrlsUseCase,
  ProjectUrlEntry,
} from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import { useFilteredCustomProjects } from './useFilteredCustomProjects'

const projects: SavedTabsCustomProjectDto[] = [
  {
    id: 'project',
    name: '資料庫',
    categories: [],
    memberships: [{ urlId: 'alpha' }, { urlId: 'beta' }],
    createdAt: 1,
    updatedAt: 1,
  },
]
const urls: ProjectUrlEntry[] = ['alpha', 'beta'].map((id) => ({
  id,
  title: id,
  url: `https://search.example/${id}`,
  savedAt: 1,
}))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const runSearch = async () => {
  await act(async () => {
    await vi.runAllTimersAsync()
  })
}

const buildReaders = (
  read = vi
    .fn<GetProjectSearchUrlsUseCase>()
    .mockResolvedValue(new Map([['project', urls]])),
) => ({
  getProjectSearchUrls: read,
})

describe('useFilteredCustomProjects current results', () => {
  it('debounces rapid input and reuses one read for the current project list', async () => {
    const readers = buildReaders()
    const { result, rerender } = renderHook(
      ({ query }) => useFilteredCustomProjects(readers, projects, query),
      { initialProps: { query: 'alpha' } },
    )
    rerender({ query: 'beta' })
    expect(readers.getProjectSearchUrls).not.toHaveBeenCalled()
    expect(result.current).toEqual([])

    await runSearch()
    expect(result.current[0]?.urls?.map((url) => url.id)).toEqual(['beta'])
    rerender({ query: 'alpha' })
    expect(result.current).toEqual([])
    await runSearch()
    expect(result.current[0]?.urls?.map((url) => url.id)).toEqual(['alpha'])
    expect(readers.getProjectSearchUrls).toHaveBeenCalledTimes(1)
  })

  it('discards a pending read when the search is cleared and reentered', async () => {
    const first = Promise.withResolvers<Map<string, ProjectUrlEntry[]>>()
    const readers = buildReaders(
      vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(
          new Map([['project', urls.filter(({ id }) => id === 'beta')]]),
        ),
    )
    const { result, rerender } = renderHook(
      ({ query }) => useFilteredCustomProjects(readers, projects, query),
      { initialProps: { query: 'alpha' } },
    )
    await runSearch()
    rerender({ query: '' })
    expect(result.current).toBe(projects)
    rerender({ query: 'alpha' })
    await runSearch()
    expect(result.current).toEqual([])
    await act(async () => {
      first.resolve(new Map([['project', urls]]))
    })
    expect(result.current).toEqual([])
    expect(readers.getProjectSearchUrls).toHaveBeenCalledTimes(2)
  })

  it('updates name matches, additions and changed URL memberships from a new projection', async () => {
    const original = projects[0]
    if (!original) {
      throw new Error('Missing search project')
    }
    const added = { ...original, id: 'added', name: 'beta' }
    const renamed = {
      ...original,
      name: '資料庫更新',
      updatedAt: 2,
      memberships: [{ urlId: 'new' }],
    }
    const updatedUrl = {
      id: 'new',
      title: 'beta',
      url: 'https://search.example/new',
      savedAt: 2,
    }
    const readers = buildReaders(
      vi
        .fn()
        .mockResolvedValueOnce(new Map([['project', urls]]))
        .mockResolvedValueOnce(new Map([['project', [updatedUrl]]])),
    )
    const { result, rerender } = renderHook(
      ({ source, query }) => useFilteredCustomProjects(readers, source, query),
      { initialProps: { source: projects, query: 'beta' } },
    )
    await runSearch()
    expect(result.current[0]?.urls?.map((url) => url.id)).toEqual(['beta'])
    rerender({ source: [renamed, added], query: 'beta' })
    expect(result.current).toEqual([])
    await runSearch()
    expect(result.current.map(({ id }) => id)).toEqual(['added', 'project'])
    expect(result.current[1]?.urls?.map((url) => url.id)).toEqual(['new'])
    expect(result.current[1]?.name).toBe('資料庫更新')
    expect(readers.getProjectSearchUrls).toHaveBeenCalledTimes(2)
  })

  it('accepts only the latest query when both searches await the same read', async () => {
    const pending = Promise.withResolvers<Map<string, ProjectUrlEntry[]>>()
    const readers = buildReaders(
      vi.fn<GetProjectSearchUrlsUseCase>().mockReturnValue(pending.promise),
    )
    const { result, rerender } = renderHook(
      ({ query }) => useFilteredCustomProjects(readers, projects, query),
      { initialProps: { query: 'alpha' } },
    )
    await runSearch()
    rerender({ query: 'beta' })
    await runSearch()
    await act(async () => {
      pending.resolve(new Map([['project', urls]]))
    })
    expect(result.current[0]?.urls?.map((url) => url.id)).toEqual(['beta'])
    expect(readers.getProjectSearchUrls).toHaveBeenCalledTimes(1)
  })
})
