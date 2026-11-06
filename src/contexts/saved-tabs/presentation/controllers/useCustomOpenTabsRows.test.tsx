// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
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
    getOpenUrlsSnapshot: () => [...urls],
    subscribeOpenUrls: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const setOpen = (url: string, isOpen: boolean) => {
    if (isOpen) {
      urls.add(url)
    } else {
      urls.delete(url)
    }
    notify()
  }
  return { port, setOpen }
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
    rerender({ enabled: true })
    await waitFor(() => {
      expect(result.current.map((row) => row.url)).toEqual(['https://a.test/1'])
    })
    rerender({ enabled: false })
    expect(result.current).toEqual([])
    expect(getProjectUrlsSpy).toHaveBeenCalledTimes(1)
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

  it('returns empty rows while searching and restores rows after clearing', async () => {
    const fake = createOpenUrlsFake()
    fake.setOpen('https://a.test/1', true)
    const getProjectUrlsSpy = vi.fn<GetProjectUrlsUseCase>().mockResolvedValue([
      {
        id: 'u1',
        title: 'One',
        url: 'https://a.test/1',
        savedAt: 0,
      },
    ])
    const projects = [project('p1', undefined)]

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) =>
        useCustomOpenTabsRows({
          getProjectUrlsUseCase: getProjectUrlsSpy,
          projects,
          searchQuery: query,
        }),
      {
        initialProps: { query: '' },
        wrapper: ({ children }) => withProvider(fake.port, children),
      },
    )
    // 検索中は空 (未取得を問わず)
    expect(result.current).toEqual([])

    rerender({ query: 'one' })
    expect(result.current).toEqual([])

    rerender({ query: '' })
    await waitFor(() => {
      expect(result.current.map((row) => row.url)).toStrictEqual([
        'https://a.test/1',
      ])
    })
    expect(getProjectUrlsSpy).toHaveBeenCalledTimes(1)
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
