import { createBroadcastChannelPersistenceChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter'

import { getBackgroundSavedTabsDataPlane } from './backgroundSavedTabsDataPlane'

export {
  EXPIRED_URL_RECOVERY_DAYS,
  MAX_EXPIRED_URL_RECOVERY_COUNT,
} from '@/contexts/saved-tabs/domain/services/ExpiredUrlRecoveryService'

const expiredUrlRecovery = {
  discard: async (ids: readonly string[]) =>
    getBackgroundSavedTabsDataPlane().discardExpiredUrls(ids),
  list: async () => getBackgroundSavedTabsDataPlane().listExpiredUrls(),
  purge: async () => getBackgroundSavedTabsDataPlane().purgeExpiredUrls(),
  restore: async (ids: readonly string[]) =>
    getBackgroundSavedTabsDataPlane().restoreExpiredUrls(ids),
  restoreWithUndo: async (ids: readonly string[]) =>
    getBackgroundSavedTabsDataPlane().restoreExpiredUrlsWithUndo(ids),
  subscribe: (onChange: () => void) =>
    createBroadcastChannelPersistenceChangeAdapter().subscribe((event) => {
      if (event.scopes.includes('expiredUrls')) {
        onChange()
      }
    }),
}

export const getExpiredUrlRecovery = () => expiredUrlRecovery
