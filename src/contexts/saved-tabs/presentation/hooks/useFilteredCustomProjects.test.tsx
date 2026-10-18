import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  GetProjectUrlsUseCase,
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

afterEach(cleanup)

describe('useFilteredCustomProjects current results', () => {
  it('clears a prior query generation on leaving and reentering the same query', async () => {
    const first = Promise.withResolvers<ProjectUrlEntry[]>()
    const reentry = Promise.withResolvers<ProjectUrlEntry[]>()
    const getProjectUrls = vi
      .fn<GetProjectUrlsUseCase>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(reentry.promise)
    const useCases = { getProjectUrls }
    const { result, rerender } = renderHook(
      ({ query }) => useFilteredCustomProjects(useCases, projects, query),
      { initialProps: { query: 'alpha' } },
    )
    expect(result.current).toEqual([])
    await act(async () => {
      first.resolve(urls)
      await first.promise
    })
    expect(result.current[0]?.urls?.map((url) => url.id)).toEqual(['alpha'])

    rerender({ query: '' })
    expect(result.current).toBe(projects)
    rerender({ query: 'alpha' })
    expect(result.current).toEqual([])
    expect(getProjectUrls).toHaveBeenCalledTimes(2)
    await act(async () => {
      reentry.resolve(urls.filter((url) => url.id === 'beta'))
      await reentry.promise
    })
    expect(result.current).toEqual([])
  })

  it('hides results when the project source or URL reader changes', async () => {
    const pending = Promise.withResolvers<ProjectUrlEntry[]>()
    const getProjectUrls = vi
      .fn<GetProjectUrlsUseCase>()
      .mockResolvedValue(urls)
    const useCases = { getProjectUrls }
    const replacement = {
      getProjectUrls: vi
        .fn<GetProjectUrlsUseCase>()
        .mockReturnValue(pending.promise),
    }
    const { result, rerender } = renderHook(
      ({ source, readers }) =>
        useFilteredCustomProjects(readers, source, 'alpha'),
      { initialProps: { source: projects, readers: useCases } },
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current[0]?.urls?.map((url) => url.id)).toEqual(['alpha'])
    rerender({
      source: projects.map((project) => ({ ...project, updatedAt: 2 })),
      readers: replacement,
    })
    expect(result.current).toEqual([])
    await act(async () => {
      pending.resolve(urls)
      await pending.promise
    })
    expect(result.current[0]?.updatedAt).toBe(2)
  })

  it('keeps the latest query after an older read completes', async () => {
    const older = Promise.withResolvers<ProjectUrlEntry[]>()
    const newer = Promise.withResolvers<ProjectUrlEntry[]>()
    const useCases = {
      getProjectUrls: vi
        .fn<GetProjectUrlsUseCase>()
        .mockReturnValueOnce(older.promise)
        .mockReturnValueOnce(newer.promise),
    }
    const { result, rerender } = renderHook(
      ({ query }) => useFilteredCustomProjects(useCases, projects, query),
      { initialProps: { query: 'alpha' } },
    )
    rerender({ query: 'beta' })
    await act(async () => {
      newer.resolve(urls)
      await newer.promise
    })
    expect(result.current[0]?.urls?.map((url) => url.id)).toEqual(['beta'])
    await act(async () => {
      older.resolve(urls)
      await older.promise
    })
    expect(result.current[0]?.urls?.map((url) => url.id)).toEqual(['beta'])
  })
})
