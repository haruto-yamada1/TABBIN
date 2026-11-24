import { describe, expect, it, vi } from 'vitest'

import { handlePromiseSettlement } from './handlePromiseSettlement'

describe('handlePromiseSettlement', () => {
  it('passes the original rejection to the failure handler', async () => {
    const error = new Error('storage request failed')
    const onFulfilled = vi.fn(() => 'saved')
    const onRejected = vi.fn(() => 'retry')

    await expect(
      handlePromiseSettlement(Promise.reject(error), onFulfilled, onRejected),
    ).resolves.toBe('retry')
    expect(onFulfilled).not.toHaveBeenCalled()
    expect(onRejected).toHaveBeenCalledExactlyOnceWith(error)
  })

  it('propagates exceptions from the success handler', async () => {
    const error = new Error('update failed')
    const onRejected = vi.fn(() => 'retry')

    await expect(
      handlePromiseSettlement(
        Promise.resolve('saved'),
        () => {
          throw error
        },
        onRejected,
      ),
    ).rejects.toBe(error)
    expect(onRejected).not.toHaveBeenCalled()
  })

  it('preserves the registration order of reactions to the same promise', async () => {
    const deferred = Promise.withResolvers<string>()
    const calls: string[] = []
    const before = deferred.promise.then(() => {
      calls.push('before')
    })
    const handled = handlePromiseSettlement(
      deferred.promise,
      (value) => {
        calls.push(value)
      },
      () => {
        throw new Error('unreachable rejection')
      },
    )
    const after = deferred.promise.then(() => {
      calls.push('after')
    })

    deferred.resolve('saved')
    await Promise.all([before, handled, after])
    expect(calls).toEqual(['before', 'saved', 'after'])
  })
})
