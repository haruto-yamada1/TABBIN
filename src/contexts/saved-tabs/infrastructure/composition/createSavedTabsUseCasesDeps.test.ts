import { describe, expect, it, vi } from 'vitest'

import * as chromeStorageModule from '@/lib/browser/chrome-storage'

import { createSavedTabsUseCasesDeps } from './createSavedTabsUseCasesDeps'
import * as persistenceRuntimeModule from './persistenceBootstrapRuntime'

vi.mock('./persistenceBootstrapRuntime', async () => {
  const actual = await vi.importActual<typeof persistenceRuntimeModule>(
    './persistenceBootstrapRuntime',
  )
  return {
    ...actual,
    getPersistenceStorageLocal: vi.fn(),
  }
})

vi.mock('@/lib/browser/chrome-storage', async () => {
  const actual = await vi.importActual<typeof chromeStorageModule>(
    '@/lib/browser/chrome-storage',
  )
  return {
    ...actual,
    getChromeStorageLocal: vi.fn(),
  }
})

const getPersistenceStorageLocal =
  persistenceRuntimeModule.getPersistenceStorageLocal
const getChromeStorageLocal = chromeStorageModule.getChromeStorageLocal

const createStorage = (get: ReturnType<typeof vi.fn>) =>
  ({
    get,
    remove: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
  }) as unknown as typeof chrome.storage.local

describe('createSavedTabsUseCasesDeps', () => {
  it('keeps user settings on raw storage after domain cutover', async () => {
    const gatedGet = vi.fn(async () => {
      throw new Error('legacy route is unavailable after cutover')
    })
    const settingsGet = vi.fn(async () => ({ userSettings: [] }))
    vi.mocked(getPersistenceStorageLocal).mockReturnValue(
      createStorage(gatedGet),
    )
    vi.mocked(getChromeStorageLocal).mockReturnValue(createStorage(settingsGet))

    const dependencies = createSavedTabsUseCasesDeps()

    await expect(
      dependencies.userSettingsRepository.findAll(),
    ).resolves.toBeDefined()
    expect(settingsGet).toHaveBeenCalledWith('userSettings')
    expect(gatedGet).not.toHaveBeenCalled()
  })
})
