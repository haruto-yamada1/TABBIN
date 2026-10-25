import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PersistenceChangeEvent } from '@/contexts/saved-tabs/application/ports/PersistenceChangePort'

const mocked = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock(
  '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter',
  () => ({
    createBroadcastChannelPersistenceChangeAdapter: () => ({
      subscribe: mocked.subscribe,
    }),
  }),
)
vi.mock('@/lib/browser/runtime', () => ({
  sendRuntimeMessage: mocked.sendRuntimeMessage,
}))

import { startNativeTitleIndicatorRelay } from './nativeTitleIndicatorRelay'

describe('native title indicator wake relay', () => {
  let receiveChange: ((event: PersistenceChangeEvent) => void) | undefined
  let cleanup: (() => void) | undefined
  const publishChange = (scopes: PersistenceChangeEvent['scopes']) => {
    receiveChange?.({ changeId: 'change', revision: 1, scopes })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    receiveChange = undefined
    mocked.subscribe.mockImplementation((listener) => {
      receiveChange = listener
      return mocked.unsubscribe
    })
    mocked.sendRuntimeMessage.mockResolvedValue({ status: 'ok' })
  })

  afterEach(() => cleanup?.())

  it.each(['urls', 'memberships', 'collections'] as const)(
    'wakes background for %s changes without forwarding data',
    async (scope) => {
      cleanup = startNativeTitleIndicatorRelay()
      publishChange([scope])
      await vi.waitFor(() =>
        expect(mocked.sendRuntimeMessage).toHaveBeenCalledOnce(),
      )
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledWith({
        action: 'refreshNativeSavedTabTitles',
      })
    },
  )

  it('ignores unrelated persistence scopes', async () => {
    cleanup = startNativeTitleIndicatorRelay()
    publishChange([
      'analyticsViews',
      'categories',
      'conversations',
      'groups',
      'recoverySnapshots',
    ])
    await Promise.resolve()
    expect(mocked.sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it('coalesces a burst and requests one follow-up when changes arrive during a wake', async () => {
    let settleWake: (() => void) | undefined
    mocked.sendRuntimeMessage.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          settleWake = resolve
        }),
    )
    cleanup = startNativeTitleIndicatorRelay()
    publishChange(['urls'])
    publishChange(['memberships'])
    publishChange(['collections'])
    await vi.waitFor(() =>
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledOnce(),
    )

    publishChange(['urls'])
    publishChange(['memberships'])
    expect(mocked.sendRuntimeMessage).toHaveBeenCalledOnce()
    settleWake?.()
    await vi.waitFor(() =>
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledTimes(2),
    )
  })

  it('keeps later changes usable after a runtime error', async () => {
    mocked.sendRuntimeMessage.mockRejectedValueOnce(new Error('unavailable'))
    cleanup = startNativeTitleIndicatorRelay()
    publishChange(['urls'])
    await vi.waitFor(() =>
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledOnce(),
    )
    publishChange(['memberships'])
    await vi.waitFor(() =>
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledTimes(2),
    )
  })

  it('subscribes once, cancels queued work on cleanup, and can restart', async () => {
    cleanup = startNativeTitleIndicatorRelay()
    const secondCleanup = startNativeTitleIndicatorRelay()
    expect(mocked.subscribe).toHaveBeenCalledOnce()
    expect(secondCleanup).toBe(cleanup)
    publishChange(['urls'])
    cleanup()
    cleanup()
    publishChange(['urls'])
    await Promise.resolve()
    expect(mocked.sendRuntimeMessage).not.toHaveBeenCalled()
    expect(mocked.unsubscribe).toHaveBeenCalledOnce()

    cleanup = startNativeTitleIndicatorRelay()
    expect(mocked.subscribe).toHaveBeenCalledTimes(2)
    publishChange(['urls'])
    await vi.waitFor(() =>
      expect(mocked.sendRuntimeMessage).toHaveBeenCalledOnce(),
    )
  })

  it('does not prevent app bootstrap when the change transport is unavailable', () => {
    mocked.subscribe.mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    expect(() => {
      cleanup = startNativeTitleIndicatorRelay()
    }).not.toThrow()
    cleanup = startNativeTitleIndicatorRelay()
    expect(mocked.subscribe).toHaveBeenCalledTimes(2)
  })
})
