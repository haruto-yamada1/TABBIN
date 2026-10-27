import { describe, expect, it } from 'vitest'

import { createChromeSavedSearchesAdapter } from './ChromeSavedSearchesAdapter'

describe('saved searches persistence', () => {
  it('retains conditions across adapter instances and serializes concurrent edits', async () => {
    const state: Record<string, unknown> = { userSettings: { language: 'ja' } }
    let pending = Promise.resolve()
    const storage = {
      get: async (key: string) => ({ [key]: state[key] }),
      set: async (values: Record<string, unknown>) => {
        Object.assign(state, values)
      },
    }
    const runExclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
      const result = pending.then(operation)
      pending = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    }
    let id = 0
    const createId = () => String(++id)
    const first = createChromeSavedSearchesAdapter({
      storage,
      runExclusive,
      createId,
    })
    const second = createChromeSavedSearchesAdapter({
      storage,
      runExclusive,
      createId,
    })
    await Promise.all([
      first.save('  Work  ', ' query '),
      second.save('Other', 'text'),
    ])
    expect(await second.list()).toEqual([
      { id: '1', name: 'Work', query: ' query ' },
      { id: '2', name: 'Other', query: 'text' },
    ])
    expect(state.userSettings).toMatchObject({ language: 'ja' })
    await Promise.all([first.rename('1', 'New'), second.remove('2')])
    expect(await first.list()).toEqual([
      { id: '1', name: 'New', query: ' query ' },
    ])
  })

  it('rejects invalid or oversized input and preserves stored data', async () => {
    const state: Record<string, unknown> = { userSettings: { language: 'ja' } }
    const storage = {
      get: async (key: string) => ({ [key]: state[key] }),
      set: async (values: Record<string, unknown>) => {
        Object.assign(state, values)
      },
    }
    const adapter = createChromeSavedSearchesAdapter({
      storage,
      runExclusive: async (operation) => operation(),
      createId: () => 'id',
    })
    await expect(adapter.save(' ', 'query')).rejects.toBeInstanceOf(Error)
    await expect(adapter.save('valid', ' '.repeat(2))).rejects.toBeInstanceOf(
      Error,
    )
    await expect(
      adapter.save('valid', 'x'.repeat(2049)),
    ).rejects.toBeInstanceOf(Error)
    await expect(adapter.rename('missing', 'name')).rejects.toBeInstanceOf(
      Error,
    )
    expect(state.userSettings).toEqual({ language: 'ja' })
  })

  it('does not overwrite malformed stored searches or claim a failed write succeeded', async () => {
    const state: Record<string, unknown> = {
      userSettings: { savedSearches: 'invalid' },
    }
    const storage = {
      get: async (key: string) => ({ [key]: state[key] }),
      set: async () => {
        throw new Error('write failed')
      },
    }
    const adapter = createChromeSavedSearchesAdapter({
      storage,
      runExclusive: async (operation) => operation(),
      createId: () => 'id',
    })
    await expect(adapter.list()).rejects.toBeInstanceOf(Error)
    await expect(adapter.save('name', 'query')).rejects.toBeInstanceOf(Error)
    expect(state.userSettings).toEqual({ savedSearches: 'invalid' })
    state.userSettings = { language: 'en' }
    await expect(adapter.save('name', 'query')).rejects.toThrow('write failed')
    expect(state.userSettings).toEqual({ language: 'en' })
  })
})
