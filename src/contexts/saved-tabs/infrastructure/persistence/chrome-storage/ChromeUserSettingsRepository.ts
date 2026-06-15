import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import type { UserSettings } from '@/types/storage'

import type { UserSettingsRepository } from '../../../domain/repositories/UserSettingsRepository'
import { normalizeUserSettings } from '../../../domain/services/UserSettingsDefaults'
import { USER_SETTINGS_KEY } from './savedTabsStorageKeys'
import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'

const getDefaultPort = (): ChromeStorageLocalPort | null => {
  const local = getChromeStorageLocal()
  if (!local) {
    return null
  }
  return {
    get: (key) => local.get(key),
    remove: (key) => local.remove(key),
    set: (value) => local.set(value),
  }
}

const createChromeUserSettingsRepositoryImpl = (
  port: ChromeStorageLocalPort,
): UserSettingsRepository => {
  const findAll = async (): Promise<UserSettings> => {
    const result = await port.get(USER_SETTINGS_KEY)
    return normalizeUserSettings(result).normalized
  }

  const save = async (settings: UserSettings): Promise<void> => {
    const normalized = normalizeUserSettings({ userSettings: settings }).normalized
    await port.set({ [USER_SETTINGS_KEY]: normalized })
  }

  return { findAll, save }
}

/**
 * `chrome.storage.local` 上の `USER_SETTINGS_KEY` を
 * `UserSettings` 永続化用に使う `UserSettingsRepository` 実装を生成する。
 *
 * 旧 `src/lib/storage/settings.getUserSettings` / `saveUserSettings` の
 * 正規化ロジック (`mergeStoredUserSettings` / `normalizeAiSystemPromptSettings`
 * / legacy `aiChatEnabled` / `aiProvider` 除去) を `normalizeUserSettings`
 * 純関数に集約し、presentation 層から `@/lib/storage/settings` を
 * import しない方針 (issue #509) に揃える。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeUserSettingsRepository = (
  port: ChromeStorageLocalPort | null = getDefaultPort(),
): UserSettingsRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeUserSettingsRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeUserSettingsRepository を初期化できません',
    )
  }
  return createChromeUserSettingsRepositoryImpl(port)
}
