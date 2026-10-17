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
