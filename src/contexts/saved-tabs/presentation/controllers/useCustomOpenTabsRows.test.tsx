// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import { SavedTabsUseCasesProvider } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { useCustomOpenTabsRows } from '@/contexts/saved-tabs/presentation/controllers/useCustomOpenTabsRows'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

const createOpenUrlsFake = () => {
  const urls = new Set<string>()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }
  const port = {
    getSnapshot: () => false,
    subscribe: () => () => {},
    getOpenUrlsSnapshot: vi.fn(() => [...urls]),
    subscribeOpenUrls: vi.fn((listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }),
  }
  const setOpen = (url: string, isOpen: boolean) => {
    if (isOpen) {
      urls.add(url)
    } else {
      urls.delete(url)
    }
    notify()
  }
  return { port, setOpen, listeners }
}

const withProvider = (fakePort: unknown, ui: React.ReactNode) => (
  <SavedTabsUseCasesProvider
    value={{
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      deps: {
        ...createSavedTabsPresentationPortsStub(),
        openSavedTabsPort: fakePort as never,
      },
      useCases: createSavedTabsUseCasesStub(),
    }}
  >
    {ui}
  </SavedTabsUseCasesProvider>
)

const project = (id: string, urls: CustomProject['urls']): CustomProject => ({
  id,
  name: id,
  categories: [],
  createdAt: 1,
  updatedAt: 2,
  ...(urls !== undefined ? { urls } : {}),
})

describe('useCustomOpenTabsRows', () => {
  it('loads on opt-in and immediately hides rows on opt-out', async () => {
    const fake = createOpenUrlsFake()
    fake.setOpen('https://a.test/1', true)
    const projects = [project('p1', undefined)]
    const getProjectUrlsSpy = vi
      .fn<GetProjectUrlsUseCase>()
      .mockResolvedValue([
        { id: 'u1', title: 'One', url: 'https://a.test/1', savedAt: 0 },
      ])
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useCustomOpenTabsRows({
          enabled,
          getProjectUrlsUseCase: getProjectUrlsSpy,
          projects,
          searchQuery: '',
        }),
      {
        initialProps: { enabled: false },
        wrapper: ({ children }) => withProvider(fake.port, children),
      },
    )
    expect(result.current).toEqual([])
    expect(getProjectUrlsSpy).not.toHaveBeenCalled()
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()
    expect(fake.port.subscribeOpenUrls).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() => {
      expect(result.current.map((row) => row.url)).toEqual(['https://a.test/1'])
    })
    rerender({ enabled: false })
    expect(result.current).toEqual([])
    expect(getProjectUrlsSpy).toHaveBeenCalledTimes(1)
    expect(fake.listeners.size).toBe(0)
    fake.port.getOpenUrlsSnapshot.mockClear()
    rerender({ enabled: false })
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() => {
      expect(result.current.map((row) => row.url)).toEqual(['https://a.test/1'])
    })
    expect(getProjectUrlsSpy).toHaveBeenCalledTimes(2)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('fetches urls for projects without urls and keeps rows following open urls', async () => {
    const fake = createOpenUrlsFake()
    const getProjectUrlsSpy = vi
      .fn<GetProjectUrlsUseCase>()
      .mockImplementation(async (project) =>
        project.id === 'p1'
          ? [{ id: 'u1', title: 'One', url: 'https://a.test/1', savedAt: 0 }]
          : [],
      )
    const projects = [project('p1', undefined)]

    const { result } = renderHook(
      () =>
        useCustomOpenTabsRows({
          getProjectUrlsUseCase: getProjectUrlsSpy,
          projects,
          searchQuery: '',
        }),
      { wrapper: ({ children }) => withProvider(fake.port, children) },
    )
    await waitFor(() => {
      expect(getProjectUrlsSpy).toHaveBeenCalledTimes(1)
    })

    // rows stay empty until the url is open
    expect(result.current).toEqual([])
    fake.setOpen('https://a.test/1', true)
    await waitFor(() => {
      expect(result.current.map((row) => row.url)).toStrictEqual([
        'https://a.test/1',
      ])
    })
    expect(result.current.every((row) => row.groupId === 'p1')).toBe(true)

    fake.setOpen('https://a.test/1', false)
    await waitFor(() => {
      expect(result.current).toEqual([])
    })
  })

  it('does not refetch urls for projects that already carry urls', async () => {
    const fake = createOpenUrlsFake()
    const getProjectUrlsSpy = vi
      .fn<GetProjectUrlsUseCase>()
      .mockResolvedValue([])
    const projects = [
      project('p1', [{ id: 'u1', url: 'https://a.test/1', title: 'One' }]),
      project('p2', undefined),
    ]

    renderHook(
      () =>
        useCustomOpenTabsRows({
          getProjectUrlsUseCase: getProjectUrlsSpy,
          projects,
          searchQuery: '',
        }),
      { wrapper: ({ children }) => withProvider(fake.port, children) },
    )
    await waitFor(() => {
      expect(getProjectUrlsSpy).toHaveBeenCalledTimes(1)
    })
    expect(getProjectUrlsSpy.mock.calls[0]?.[0]?.id).toBe('p2')
  })

  it('does not fetch or observe open urls during search and resumes when cleared', async () => {
    const fake = createOpenUrlsFake()
    fake.setOpen('https://a.test/1', true)
    const getProjectUrlsSpy = vi
      .fn<GetProjectUrlsUseCase>()
      .mockResolvedValue([
        { id: 'u1', title: 'One', url: 'https://a.test/1', savedAt: 0 },
      ])
    const projects = [project('p1', undefined)]
    const { result, rerender } = renderHook(
      ({ query, currentProjects }) =>
        useCustomOpenTabsRows({
          getProjectUrlsUseCase: getProjectUrlsSpy,
          projects: currentProjects,
          searchQuery: query,
        }),
      {
        initialProps: { query: 'one', currentProjects: projects },
        wrapper: ({ children }) => withProvider(fake.port, children),
      },
    )
    expect(result.current).toEqual([])
    expect(getProjectUrlsSpy).not.toHaveBeenCalled()
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()
    expect(fake.port.subscribeOpenUrls).not.toHaveBeenCalled()
    rerender({ query: 'two', currentProjects: [...projects] })
    expect(getProjectUrlsSpy).not.toHaveBeenCalled()
    expect(fake.port.getOpenUrlsSnapshot).not.toHaveBeenCalled()

    rerender({ query: '  ', currentProjects: projects })
    await waitFor(() => {
      expect(result.current.map((row) => row.url)).toEqual(['https://a.test/1'])
    })
    expect(getProjectUrlsSpy).toHaveBeenCalledTimes(1)
    rerender({ query: 'one', currentProjects: projects })
    expect(result.current).toEqual([])
    expect(fake.listeners.size).toBe(0)
  })

  it.each(['projects', 'loader'] as const)(
    'hides stale rows immediately when the %s changes until the matching read finishes',
    async (changedSource) => {
      const fake = createOpenUrlsFake()
      fake.setOpen('https://a.test/1', true)
      fake.setOpen('https://a.test/2', true)
      const heldRead =
        Promise.withResolvers<Awaited<ReturnType<GetProjectUrlsUseCase>>>()
      const firstLoader = vi
        .fn<GetProjectUrlsUseCase>()
        .mockResolvedValueOnce([
          { id: 'u1', title: 'One', url: 'https://a.test/1', savedAt: 0 },
        ])
        .mockReturnValue(heldRead.promise)
      const projects = [project('p1', undefined)]
      const { result, rerender } = renderHook(
        ({ currentProjects, loader }) =>
          useCustomOpenTabsRows({
            getProjectUrlsUseCase: loader,
            projects: currentProjects,
            searchQuery: '',
          }),
        {
          initialProps: { currentProjects: projects, loader: firstLoader },
          wrapper: ({ children }) => withProvider(fake.port, children),
        },
      )
      await waitFor(() => {
        expect(result.current.map((row) => row.url)).toEqual([
          'https://a.test/1',
        ])
      })
      rerender({
        currentProjects:
          changedSource === 'projects' ? [project('p1', undefined)] : projects,
        loader:
          changedSource === 'loader'
            ? vi.fn<GetProjectUrlsUseCase>().mockReturnValue(heldRead.promise)
            : firstLoader,
      })
      expect(result.current).toEqual([])
      await act(async () => {
        heldRead.resolve([
          { id: 'u2', title: 'Two', url: 'https://a.test/2', savedAt: 0 },
        ])
      })
      expect(result.current.map((row) => row.url)).toEqual(['https://a.test/2'])
    },
  )

  it('discards a late read for an earlier projects snapshot', async () => {
    const fake = createOpenUrlsFake()
    fake.setOpen('https://a.test/1', true)
    fake.setOpen('https://a.test/2', true)
    const firstRead =
      Promise.withResolvers<Awaited<ReturnType<GetProjectUrlsUseCase>>>()
    const nextRead =
      Promise.withResolvers<Awaited<ReturnType<GetProjectUrlsUseCase>>>()
    const getProjectUrlsSpy = vi
      .fn<GetProjectUrlsUseCase>()
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(nextRead.promise)
    const { result, rerender } = renderHook(
      ({ projects }) =>
        useCustomOpenTabsRows({
          getProjectUrlsUseCase: getProjectUrlsSpy,
          projects,
          searchQuery: '',
        }),
      {
        initialProps: { projects: [project('p1', undefined)] },
        wrapper: ({ children }) => withProvider(fake.port, children),
      },
    )
    rerender({ projects: [project('p2', undefined)] })
    await act(async () => {
      nextRead.resolve([
        { id: 'u2', title: 'Two', url: 'https://a.test/2', savedAt: 0 },
      ])
    })
    expect(result.current.map((row) => row.groupId)).toEqual(['p2'])
    await act(async () => {
      firstRead.resolve([
        { id: 'u1', title: 'One', url: 'https://a.test/1', savedAt: 0 },
      ])
    })
    expect(result.current.map((row) => row.url)).toEqual(['https://a.test/2'])
    expect(result.current.map((row) => row.groupId)).toEqual(['p2'])
  })

  it('logs and keeps rows empty when url fetch fails', async () => {
    const fake = createOpenUrlsFake()
    fake.setOpen('https://a.test/1', true)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const getProjectUrlsSpy = vi
      .fn<GetProjectUrlsUseCase>()
      .mockRejectedValue(new Error('boom'))
    const projects = [project('p1', undefined)]

    const { result } = renderHook(
      () =>
        useCustomOpenTabsRows({
          getProjectUrlsUseCase: getProjectUrlsSpy,
          projects,
          searchQuery: '',
        }),
      { wrapper: ({ children }) => withProvider(fake.port, children) },
    )
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled()
    })
    expect(result.current).toEqual([])
    errorSpy.mockRestore()
  })
})
