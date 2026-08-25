import type { IndexedDbSavedTabsDataPlaneDeps } from '@/contexts/saved-tabs/application/IndexedDbSavedTabsDataPlaneDeps'
import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import { createChromeBrowserTabAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import type { ChromeApiLike as ChromeApiLikeBase } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import { createChromeBrowserWindowAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserWindowAdapter'
import { createChromeMessagingAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter'
import type { ChromeApiLike as ChromeMessagingApiLike } from '@/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter'
import { createSonnerNotificationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter'
import { createSystemClock } from '@/contexts/saved-tabs/infrastructure/browser/SystemClockAdapter'
import { createSystemIdGenerator } from '@/contexts/saved-tabs/infrastructure/browser/SystemIdGeneratorAdapter'
import { createChromeUserSettingsRepository } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUserSettingsRepository'
import { getChromeGlobal, isObjectLike } from '@/lib/browser/chrome-global'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

import type { CreateSavedTabsUseCasesDepsOptions } from './createSavedTabsUseCasesDeps'

type ChromeLike = ChromeApiLikeBase & {
  readonly tabs?: {
    readonly create?: (createProperties: {
      readonly active?: boolean
      readonly url: string
    }) => Promise<{ readonly url?: string } | undefined> | undefined
  }
  readonly windows?: {
    readonly create?: (createProperties: {
      readonly focused?: boolean
      readonly url?: readonly string[] | string
    }) =>
      | Promise<
          { readonly tabs?: readonly { readonly url?: string }[] } | undefined
        >
      | undefined
  }
  readonly runtime?: ChromeMessagingApiLike['runtime']
}

const isChromeLike = (value: unknown): value is ChromeLike =>
  isObjectLike(value)

const getChromeApi = (): ChromeLike | undefined => getChromeGlobal(isChromeLike)

const getChromeMessagingApi = (): ChromeMessagingApiLike | undefined => {
  const api = getChromeApi()
  return api?.runtime ? { runtime: api.runtime } : undefined
}

export const createIndexedDbSavedTabsExternalDeps = (
  storageChangePort: StorageChangePort,
  options: CreateSavedTabsUseCasesDepsOptions = {},
): Omit<IndexedDbSavedTabsDataPlaneDeps, 'queryPort' | 'unitOfWorkPort'> => {
  const settingsStorage = getChromeStorageLocal()
  const settingsPort = settingsStorage
    ? {
        get: async (key: string) => settingsStorage.get(key),
        remove: async (key: string) => settingsStorage.remove(key),
        set: async (value: Record<string, unknown>) =>
          settingsStorage.set(value),
      }
    : null
  return {
    browserTabPort: createChromeBrowserTabAdapter(
      { getApi: () => getChromeApi() },
      options.resolveActive ? { resolveActive: options.resolveActive } : {},
    ),
    browserWindowPort: createChromeBrowserWindowAdapter({
      getApi: () => getChromeApi(),
    }),
    clock: createSystemClock(),
    idGenerator: createSystemIdGenerator(),
    messagingPort: createChromeMessagingAdapter({
      getApi: getChromeMessagingApi,
    }),
    notificationPort: createSonnerNotificationAdapter(),
    storageChangePort,
    userSettingsRepository: createChromeUserSettingsRepository(settingsPort),
  }
}
