import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ACADEMY_WELCOME_KEY,
  ACADEMY_WELCOME_LOCK,
  createChromeAcademyWelcomeRepository,
} from '@/features/academy/infrastructure/ChromeAcademyWelcomeRepository'

const setup = (initial?: unknown) => {
  const data: Record<string, unknown> = {
    [ACADEMY_WELCOME_KEY]: initial,
    unrelated: 'preserve',
  }
  const storage = {
    get: vi.fn(async () => ({ ...data })),
    set: vi.fn(async (value: Record<string, unknown>) => {
      Object.assign(data, value)
    }),
  }
  let tail = Promise.resolve()
  const runExclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation)
    tail = result.then(
      () => {},
      () => {},
    )
    return result
  }
  return { data, storage, deps: { storage, runExclusive } }
}

afterEach(() => vi.unstubAllGlobals())

describe('Academy welcome persistence', () => {
  it('leaves existing users ineligible without any writes on load', async () => {
    const { storage, deps } = setup()
    const repository = createChromeAcademyWelcomeRepository(deps)
    expect(await repository.isPending()).toBe(false)
    expect(await repository.claim()).toBe(false)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('arms on install, then preserves consumption across repository instances and duplicate install', async () => {
    const { data, deps } = setup()
    const repository = createChromeAcademyWelcomeRepository(deps)
    await repository.prepare()
    expect(await repository.isPending()).toBe(true)
    expect(await repository.claim()).toBe(true)
    const reopened = createChromeAcademyWelcomeRepository(deps)
    await reopened.prepare()
    expect(await reopened.claim()).toBe(false)
    expect(data).toEqual({
      [ACADEMY_WELCOME_KEY]: 'presented',
      unrelated: 'preserve',
    })
  })

  it('allows only one of two concurrent pages to present the guide', async () => {
    const { deps } = setup('pending')
    const first = createChromeAcademyWelcomeRepository(deps)
    const second = createChromeAcademyWelcomeRepository(deps)
    expect(await Promise.all([first.claim(), second.claim()])).toEqual([
      true,
      false,
    ])
  })

  it('surfaces failed writes before claiming a presentation', async () => {
    const { storage, deps } = setup('pending')
    storage.set.mockRejectedValue(new Error('quota'))
    await expect(
      createChromeAcademyWelcomeRepository(deps).claim(),
    ).rejects.toThrow('quota')
  })

  it('does not write when storage reads fail', async () => {
    const { storage, deps } = setup('pending')
    storage.get.mockRejectedValue(new Error('read failed'))
    const repository = createChromeAcademyWelcomeRepository(deps)
    await expect(repository.prepare()).rejects.toThrow('read failed')
    await expect(repository.isPending()).rejects.toThrow('read failed')
    await expect(repository.claim()).rejects.toThrow('read failed')
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('rejects unknown stored state without rewriting it', async () => {
    const { storage, deps } = setup({ invalid: 'pending' })
    const repository = createChromeAcademyWelcomeRepository(deps)
    await expect(repository.prepare()).rejects.toThrow('invalid')
    await expect(repository.claim()).rejects.toThrow('invalid')
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('requires cross-context coordination and does not silently run unlocked', async () => {
    const { storage } = setup('pending')
    vi.stubGlobal('navigator', {})
    await expect(
      createChromeAcademyWelcomeRepository({ storage }).claim(),
    ).rejects.toThrow('coordination')
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('uses the same exclusive browser lock for installing and presenting', async () => {
    const { storage, deps } = setup()
    const request = vi.fn(
      async (
        _name: string,
        _options: unknown,
        action: () => Promise<unknown>,
      ) => action(),
    )
    vi.stubGlobal('navigator', { locks: { request } })
    const repository = createChromeAcademyWelcomeRepository({ storage })
    await repository.prepare()
    await repository.claim()
    expect(request).toHaveBeenCalledWith(
      ACADEMY_WELCOME_LOCK,
      { mode: 'exclusive' },
      expect.any(Function),
    )
    expect(request).toHaveBeenCalledTimes(2)
    expect(await createChromeAcademyWelcomeRepository(deps).claim()).toBe(false)
  })
})
