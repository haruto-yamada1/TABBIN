import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { savedTabsDefaultUserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import { BrowserOpenError } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import { UrlOpeningPostProcessingError } from '@/contexts/saved-tabs/application/errors/UrlOpeningPostProcessingError'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'

import { useTabOpeningHandlers } from './useTabOpeningHandlers'

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

describe('URL opening operation', () => {
  it('reports live progress, settles cancellation, and recovers each remaining partition without duplicate successes', async () => {
    const urls = [
      'https://opened.example',
      'https://failed.example',
      'https://unopened.example',
    ] as const
    const pending = Promise.withResolvers<undefined>()
    const started = Promise.withResolvers<undefined>()
    let signal: AbortSignal | undefined
    const openAllSavedUrls = vi.fn(
      async (
        command: { readonly urls: readonly string[] },
        options?: {
          readonly signal?: AbortSignal
          readonly onProgress?: (progress: {
            total: number
            opened: number
            failed: number
          }) => void
        },
      ) => {
        if (command.urls.length === 3) {
          signal = options?.signal
          options?.onProgress?.({ total: 3, opened: 1, failed: 1 })
          started.resolve(undefined)
          await pending.promise
          return {
            openedUrls: [urls[0]],
            failedUrls: [{ url: urls[1], reason: 'permission' as const }],
            cancelledUrls: [urls[2]],
            removedUrlRecordIds: [],
            removedUrlRecords: [],
            snapshot: null,
          }
        }
        return {
          openedUrls: command.urls,
          failedUrls: [],
          cancelledUrls: [],
          removedUrlRecordIds: [],
          removedUrlRecords: [],
          snapshot: null,
        }
      },
    )
    const { result } = setup(async (input) => input, {
      savedTabsUseCases: createSavedTabsUseCasesStub({ openAllSavedUrls }),
    })
    let opening: Promise<void> | undefined
    await act(async () => {
      opening = result.current.handleOpenAllTabs(
        urls.map((url) => ({ url, title: '' })),
      )
      await started.promise
    })
    expect(result.current.openingOperation).toMatchObject({
      status: 'running',
      total: 3,
      opened: 1,
      failed: 1,
      canCancel: true,
    })
    act(() => {
      result.current.cancelOpening()
      result.current.cancelOpening()
    })
    expect(signal?.aborted).toBe(true)
    expect(result.current.openingOperation?.status).toBe('cancelling')
    await act(async () => {
      pending.resolve(undefined)
      await opening
    })
    expect(result.current.openingOperation).toMatchObject({
      status: 'cancelled',
      total: 3,
      opened: 1,
      failedUrls: [{ url: urls[1], reason: 'permission' }],
      cancelledUrls: [urls[2]],
    })
    await act(async () => {
      await Promise.all([
        result.current.retryFailedUrls(),
        result.current.retryFailedUrls(),
      ])
    })
    expect(result.current.openingOperation).toMatchObject({
      status: 'cancelled',
      total: 3,
      opened: 2,
      failedUrls: [],
      cancelledUrls: [urls[2]],
    })
    await act(async () => {
      await result.current.resumeCancelledUrls()
      await result.current.resumeCancelledUrls()
    })
    expect(
      openAllSavedUrls.mock.calls.map(([command]) => command.urls),
    ).toEqual([urls, [urls[1]], [urls[2]]])
    expect(result.current.openingOperation).toMatchObject({
      status: 'complete',
      total: 3,
      opened: 3,
      failedUrls: [],
      cancelledUrls: [],
    })
    expect(openAllSavedUrls.mock.calls[0]?.[0]).not.toHaveProperty('signal')
    expect(openAllSavedUrls.mock.calls[0]?.[0]).not.toHaveProperty('onProgress')
  })

  it('accepts immediate cancellation before the first async opening step', async () => {
    const urls = ['https://first.example', 'https://second.example']
    const openAllSavedUrls = vi.fn(
      async (
        command: { readonly urls: readonly string[] },
        options?: { readonly signal?: AbortSignal },
      ) => {
        expect(options?.signal?.aborted).toBe(true)
        return {
          openedUrls: [],
          failedUrls: [],
          cancelledUrls: command.urls,
          removedUrlRecordIds: [],
          removedUrlRecords: [],
          snapshot: null,
        }
      },
    )
    const { result } = setup(async (input) => input, {
      savedTabsUseCases: createSavedTabsUseCasesStub({ openAllSavedUrls }),
    })
    await act(async () => {
      const opening = result.current.handleOpenAllTabs(
        urls.map((url) => ({ url, title: '' })),
      )
      result.current.cancelOpening()
      await opening
    })
    expect(result.current.openingOperation).toMatchObject({
      status: 'cancelled',
      opened: 0,
      cancelledUrls: urls,
    })
  })

  it('coalesces repeated bulk requests and keeps cancellation local to the active request', async () => {
    const firstUrl = 'https://first.example'
    const secondUrl = 'https://second.example'
    const firstPending = Promise.withResolvers<undefined>()
    const firstStarted = Promise.withResolvers<undefined>()
    const signals: (AbortSignal | undefined)[] = []
    const openAllSavedUrls = vi.fn(
      async (
        command: { readonly urls: readonly string[] },
        options?: { readonly signal?: AbortSignal },
      ) => {
        signals.push(options?.signal)
        if (command.urls[0] === firstUrl) {
          firstStarted.resolve(undefined)
          await firstPending.promise
        }
        return {
          openedUrls: options?.signal?.aborted ? [] : command.urls,
          failedUrls: [],
          cancelledUrls: options?.signal?.aborted ? command.urls : [],
          removedUrlRecordIds: [],
          removedUrlRecords: [],
          snapshot: null,
        }
      },
    )
    const { result } = setup(async (input) => input, {
      savedTabsUseCases: createSavedTabsUseCasesStub({ openAllSavedUrls }),
    })
    let first: Promise<void> | undefined
    let duplicate: Promise<void> | undefined
    let second: Promise<void> | undefined
    await act(async () => {
      first = result.current.handleOpenAllTabs([{ url: firstUrl, title: '' }])
      duplicate = result.current.handleOpenAllTabs([
        { url: firstUrl, title: '' },
      ])
      second = result.current.handleOpenAllTabs([{ url: secondUrl, title: '' }])
      await firstStarted.promise
    })
    expect(openAllSavedUrls).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.cancelOpening()
    })
    expect(result.current.openingOperation?.status).toBe('cancelling')
    await act(async () => {
      firstPending.resolve(undefined)
      await Promise.all([first, duplicate, second])
    })
    expect(
      openAllSavedUrls.mock.calls.map(([command]) => command.urls),
    ).toEqual([[firstUrl], [secondUrl]])
    expect(signals.map((signal) => signal?.aborted)).toEqual([true, false])
    expect(result.current.openingOperation).toMatchObject({
      status: 'complete',
      total: 1,
      opened: 1,
      failedUrls: [],
      cancelledUrls: [],
    })
  })

  it('preserves success, failure, and unstarted partitions after a saved-data update fails', async () => {
    const opened = 'https://opened.example'
    const failed = 'https://failed.example'
    const cancelled = 'https://cancelled.example'
    const openAllSavedUrls = vi.fn(
      async (command: { readonly urls: readonly string[] }) => {
        if (command.urls.length === 3) {
          throw new UrlOpeningPostProcessingError(
            [opened],
            [{ url: failed, reason: 'permission' }],
            [cancelled],
          )
        }
        return {
          openedUrls: command.urls,
          failedUrls: [],
          cancelledUrls: [],
          removedUrlRecordIds: [],
          removedUrlRecords: [],
          snapshot: null,
        }
      },
    )
    const { result } = setup(async (input) => input, {
      savedTabsUseCases: createSavedTabsUseCasesStub({ openAllSavedUrls }),
    })
    await act(async () => {
      await result.current.handleOpenAllTabs(
        [opened, failed, cancelled].map((url) => ({ url, title: '' })),
      )
    })
    expect(result.current.openingOperation).toMatchObject({
      status: 'cancelled',
      opened: 1,
      postProcessingFailed: true,
      failedUrls: [{ url: failed, reason: 'permission' }],
      cancelledUrls: [cancelled],
    })
    await act(async () => {
      await result.current.resumeCancelledUrls()
    })
    expect(result.current.openingOperation).toMatchObject({
      opened: 2,
      total: 3,
      failedUrls: [{ url: failed, reason: 'permission' }],
    })
    await act(async () => {
      await result.current.retryFailedUrls()
    })
    expect(
      openAllSavedUrls.mock.calls.map(([command]) => command.urls),
    ).toEqual([[opened, failed, cancelled], [cancelled], [failed]])
    expect(result.current.openingOperation).toMatchObject({
      opened: 3,
      total: 3,
      failedUrls: [],
      cancelledUrls: [],
      postProcessingFailed: true,
    })
  })

  it('ignores old progress and cancellation while a single opening is active', async () => {
    const single = Promise.withResolvers<{ url: string }>()
    let report:
      | ((progress: { total: number; opened: number; failed: number }) => void)
      | undefined
    const { result } = setup(async () => single.promise, {
      savedTabsUseCases: createSavedTabsUseCasesStub({
        findUrlRecordByUrl: async () => ({ record: null }),
        openAllSavedUrls: async (command, options) => {
          report = options?.onProgress
          return {
            openedUrls: command.urls,
            failedUrls: [],
            cancelledUrls: [],
            removedUrlRecordIds: [],
            removedUrlRecords: [],
            snapshot: null,
          }
        },
      }),
    })
    await act(async () => {
      await result.current.handleOpenAllTabs([
        { url: 'https://bulk.example', title: '' },
      ])
    })
    let pending: Promise<void> | undefined
    await act(async () => {
      pending = result.current.handleOpenTab('https://single.example')
      await Promise.resolve()
    })
    act(() => {
      report?.({ total: 50, opened: 30, failed: 20 })
      result.current.cancelOpening()
    })
    expect(result.current.openingOperation).toMatchObject({
      status: 'running',
      total: 1,
      opened: 0,
      failed: 0,
      canCancel: false,
    })
    await act(async () => {
      single.resolve({ url: 'https://single.example' })
      await pending
    })
    expect(result.current.openingOperation?.status).toBe('complete')
  })

  it('reports a safe failure and retries the failed URL only', async () => {
    const url = 'https://example.com/private?token=secret'
    const open = vi
      .fn<(input: { readonly url: string }) => Promise<{ url: string }>>()
      .mockRejectedValueOnce(new BrowserOpenError('permission'))
      .mockImplementation(async (input) => input)
    const { result } = setup(open)
    await act(async () => {
      await result.current.handleOpenTab(url)
    })
    expect(result.current.openingOperation).toMatchObject({
      status: 'complete',
      total: 1,
      opened: 0,
      failedUrls: [{ url, reason: 'permission' }],
    })
    await act(async () => {
      await result.current.retryFailedUrls()
    })
    expect(result.current.openingOperation).toMatchObject({
      status: 'complete',
      total: 1,
      opened: 1,
      failedUrls: [],
    })
    expect(open).toHaveBeenCalledTimes(2)
  })

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
    expect(result.current.openingOperation?.status).toBe('running')
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
    expect(result.current.openingOperation?.opened).toBe(1)
  })

  it('does not expose raw errors in state or logging', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = setup(async () => {
      throw new Error('private browser diagnostic token=secret')
    })
    await act(async () => {
      await result.current.handleOpenTab('https://example.com')
    })
    expect(JSON.stringify(result.current.openingOperation)).not.toContain(
      'secret',
    )
    expect(result.current.openingOperation?.failedUrls[0]?.reason).toBe(
      'unknown',
    )
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it.each(['persistence', 'refresh'])(
    'keeps confirmed successes out of retry after %s fails',
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
      expect(result.current.openingOperation).toMatchObject({
        opened: 1,
        failedUrls: [],
        postProcessingFailed: true,
      })
      await act(async () => {
        await result.current.retryFailedUrls()
      })
      expect(openSavedUrl).toHaveBeenCalledTimes(1)
    },
  )
})
