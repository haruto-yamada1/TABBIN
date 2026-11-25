import {
  getBrowserUiLocale,
  getMessage,
  resolveUiLanguage,
} from '@/features/i18n/lib/language'
import { requireUserSettings } from '@/lib/storage/settings'
import type { UserSettings } from '@/types/storage'

import { showNotification } from './notification'

/** Operational settings never authorize mutations using display fallbacks. */
export const requireOperationalUserSettings =
  async (): Promise<UserSettings> => {
    try {
      return await requireUserSettings()
    } catch (error) {
      // Read the browser locale directly: reading settings again could repair data.
      const language = resolveUiLanguage(getBrowserUiLocale())
      await showNotification(
        getMessage(language, 'background.settings.readErrorTitle'),
        getMessage(language, 'background.settings.readErrorMessage'),
      )
      throw error
    }
  }
