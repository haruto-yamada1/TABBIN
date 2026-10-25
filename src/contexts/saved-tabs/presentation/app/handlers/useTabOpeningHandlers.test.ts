import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { savedTabsDefaultUserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import { BrowserOpenError } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import { UrlOpeningPostProcessingError } from '@/contexts/saved-tabs/application/errors/UrlOpeningPostProcessingError'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'

import { useTabOpeningHandlers } from './useTabOpeningHandlers'

const notifications = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: notifications }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const setup = (
  open: (input: { readonly url: string }) => Promise<{ url: string }>,
  overrides: Partial<Parameters<typeof useTabOpeningHandlers>[0]> = {},
) =>
  renderHook(() =>
    useTabOpeningHandlers({
      categories: [],
      deps: createSavedTabsPresentationPortsStub({ browserTabPort: { open } }),
      savedTabsUseCases: createSavedTabsUseCasesStub({
        findUrlRecordByUrl: async () => ({ record: null }),
      }),
      settings: { ...savedTabsDefaultUserSettings, removeTabAfterOpen: false },
      refreshTabGroupsWithUrls: async () => [],
      setCustomProjects: vi.fn(),
      t: (key) => key,
      ...overrides,
    }),
  )

const bulkResult = (urls: readonly string[]) => ({
  openedUrls: urls,
  failedUrls: [],
  cancelledUrls: [],
  removedUrlRecordIds: [],
  removedUrlRecords: [],
  snapshot: null,
})

describe('URL opening handlers', () => {
  it('opens without retaining progress, result, or recovery controls', async () => {
    const { result } = setup(async (input) => input)
    await act(async () => {
      await result.current.handleOpenTab('https://example.com')
    })

    expect(Object.keys(result.current).toSorted()).toEqual([
      'handleOpenAllTabs',
      'handleOpenTab',
    ])
    expect(notifications.info).not.toHaveBeenCalled()
    expect(notifications.success).not.toHaveBeenCalled()
    expect(notifications.error).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'opens a batch without UI observers (new window: %s)',
    async (newWindow) => {
      const urls = ['https://first.example', 'https://second.example']
      const openAllSavedUrls = vi.fn(async () => bulkResult(urls))
      const { result } = setup(async (input) => input, {
        settings: {
          ...savedTabsDefaultUserSettings,
          removeTabAfterOpen: false,
          openAllInNewWindow: newWindow,
        },
        savedTabsUseCases: createSavedTabsUseCasesStub({ openAllSavedUrls }),
      })
      await act(async () => {
        await result.current.handleOpenAllTabs(
          urls.map((url) => ({ url, title: '' })),
        )
      })

      expect(openAllSavedUrls).toHaveBeenCalledExactlyOnceWith({
        mode: newWindow ? 'newWindow' : 'backgroundTabs',
        removeTabAfterOpen: false,
        urls,
      })
      expect(notifications.error).not.toHaveBeenCalled()
      expect(notifications.info).not.toHaveBeenCalled()
      expect(notifications.success).not.toHaveBeenCalled()
    },
  )

  it.each([
    new BrowserOpenError('permission'),
    new Error('private browser diagnostic token=secret'),
  ])(
    'reports a safe error and allows an ordinary click to try again (%s)',
    async (error) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const open = vi
        .fn<(input: { readonly url: string }) => Promise<{ url: string }>>()
        .mockRejectedValueOnce(error)
        .mockImplementation(async (input) => input)
      const { result } = setup(open)
      await act(async () => {
        await result.current.handleOpenTab(
          'https://example.com/private?token=secret',
        )
        await result.current.handleOpenTab(
          'https://example.com/private?token=secret',
        )
      })

      expect(open).toHaveBeenCalledTimes(2)
      expect(notifications.error).toHaveBeenCalledExactlyOnceWith(
        'savedTabs.tab.openError',
      )
      expect(errorSpy).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    },
  )

  it('queues different URLs and coalesces duplicate clicks without losing actions', async () => {
    const pending = Promise.withResolvers<{ url: string }>()
    const open = vi.fn(async ({ url }: { url: string }) =>
      url === 'https://example.com' ? pending.promise : { url },
    )
    const { result, rerender } = setup(open)
    let first: Promise<void> | undefined
    let duplicate: Promise<void> | undefined
    let second: Promise<void> | undefined
    act(() => {
      first = result.current.handleOpenTab('https://example.com')
    })
    await act(async () => {
      await Promise.resolve()
    })
    rerender()
    act(() => {
      duplicate = result.current.handleOpenTab('https://example.com')
      second = result.current.handleOpenTab('https://other.example')
    })
    expect(open).toHaveBeenCalledTimes(1)
    await act(async () => {
      pending.resolve({ url: 'https://example.com' })
      await Promise.all([first, duplicate, second])
    })
    expect(open.mock.calls.map(([input]) => input.url)).toStrictEqual([
      'https://example.com',
      'https://other.example',
    ])
  })

  it('ignores empty batches and coalesces repeated bulk clicks', async () => {
    const pending = Promise.withResolvers<ReturnType<typeof bulkResult>>()
    const openAllSavedUrls = vi.fn(async () => pending.promise)
    const { result } = setup(async (input) => input, {
      savedTabsUseCases: createSavedTabsUseCasesStub({ openAllSavedUrls }),
    })
    await act(async () => {
      await result.current.handleOpenAllTabs([])
    })
    expect(openAllSavedUrls).not.toHaveBeenCalled()
    await act(async () => {
      const urls = [{ url: 'https://example.com', title: '' }]
      const first = result.current.handleOpenAllTabs(urls)
      const duplicate = result.current.handleOpenAllTabs(urls)
      pending.resolve(bulkResult(urls.map(({ url }) => url)))
      await Promise.all([first, duplicate])
    })
    expect(openAllSavedUrls).toHaveBeenCalledTimes(1)
  })

  it('reports partial bulk failure without automatically opening URLs again', async () => {
    const opened = 'https://opened.example'
    const failed = 'https://failed.example'
    const openAllSavedUrls = vi.fn(async () => ({
      ...bulkResult([opened]),
      failedUrls: [{ url: failed, reason: 'permission' as const }],
    }))
    const { result } = setup(async (input) => input, {
      savedTabsUseCases: createSavedTabsUseCasesStub({ openAllSavedUrls }),
    })
    await act(async () => {
      await result.current.handleOpenAllTabs(
        [opened, failed].map((url) => ({ url, title: '' })),
      )
    })
    expect(openAllSavedUrls).toHaveBeenCalledTimes(1)
    expect(notifications.error).toHaveBeenCalledExactlyOnceWith(
      'savedTabs.tab.openAllError',
    )
  })

  it('reports a rejected batch without leaking browser diagnostics', async () => {
    const { result } = setup(async (input) => input, {
      savedTabsUseCases: createSavedTabsUseCasesStub({
        openAllSavedUrls: async () => {
          throw new Error('secret browser details')
        },
      }),
    })
    await act(async () => {
      await result.current.handleOpenAllTabs([
        { url: 'https://example.com', title: '' },
      ])
    })
    expect(notifications.error).toHaveBeenCalledExactlyOnceWith(
      'savedTabs.tab.openAllError',
    )
  })

  it.each(['persistence', 'refresh'])(
    'distinguishes an already opened URL from %s failure',
    async (phase) => {
      const url = 'https://example.com'
      const snapshot = { customProjects: [], savedTabs: [], urlRecords: [] }
      const openSavedUrl = vi.fn(async () => {
        if (phase === 'persistence') {
          throw new UrlOpeningPostProcessingError([url])
        }
        return {
          openedUrl: url,
          removedUrlRecordId: null,
          removedUrlRecord: null,
          snapshot,
        }
      })
      const { result } = setup(async (input) => input, {
        settings: { ...savedTabsDefaultUserSettings, removeTabAfterOpen: true },
        savedTabsUseCases: createSavedTabsUseCasesStub({
          findUrlRecordByUrl: async () => ({
            record: { id: 'url-1', url, title: 'A' },
          }),
          buildSavedTabsSnapshot: async () => snapshot,
          openSavedUrl,
        }),
        refreshTabGroupsWithUrls: async () => {
          throw new Error('private refresh details')
        },
      })
      await act(async () => {
        await result.current.handleOpenTab(url)
      })
      expect(openSavedUrl).toHaveBeenCalledTimes(1)
      expect(notifications.error).toHaveBeenCalledExactlyOnceWith(
        'savedTabs.tab.openUpdateError',
      )
      expect(notifications.info).not.toHaveBeenCalled()
    },
  )
})
