import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type { UserSettingsRepository } from '@/contexts/saved-tabs/domain/repositories/UserSettingsRepository'
import { normalizeUserSettings } from '@/contexts/saved-tabs/domain/services/UserSettingsDefaults'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'

import type { ChromeStorageLocalPort } from './ChromeUrlRecordRepository'
import { SavedTabsRepositoryUnavailableError } from './ChromeUrlRecordRepository'
import { USER_SETTINGS_KEY } from './savedTabsStorageKeys'

type ChromeUserSettingsStoragePort = Pick<ChromeStorageLocalPort, 'get' | 'set'>

const getDefaultPort = (): ChromeUserSettingsStoragePort | null => {
  const local = getChromeStorageLocal()
  if (!local) {
    return null
  }
  return {
    get: async (key) => local.get(key),
    set: async (value) => local.set(value),
  }
}

const createChromeUserSettingsRepositoryImpl = (
  port: ChromeUserSettingsStoragePort,
): UserSettingsRepository => {
  const findAll = async (): Promise<UserSettingsDto> => {
    const result = await port.get(USER_SETTINGS_KEY)
    return normalizeUserSettings(result).normalized
  }

  const save = async (settings: UserSettingsDto): Promise<void> => {
    const normalized = normalizeUserSettings({
      userSettings: settings,
    }).normalized
    await port.set({ [USER_SETTINGS_KEY]: normalized })
  }

  return { findAll, save }
}

/**
 * `chrome.storage.local` 上の `USER_SETTINGS_KEY` を
 * `UserSettingsDto` 永続化用に使う `UserSettingsRepository` 実装を生成する。
 *
 * 旧 `src/lib/storage/settings.getUserSettings` / `saveUserSettings` の
 * 正規化ロジック (`mergeStoredUserSettings` / `normalizeAiSystemPromptSettings`
 * / legacy `aiChatEnabled` / `aiProvider` 除去) を `normalizeUserSettings`
 * 純関数に集約し、presentation 層から `@/lib/storage/settings` を
 * import しない方針 (issue #509) に揃える。
 *
 * 戻り値 / 引数は `@/types/storage.UserSettings` ではなく domain DTO
 * `UserSettingsDto` を返す (issue #511)。DTO は構造互換なので
 * `chrome.storage.local.set` の payload もそのまま書ける。
 *
 * @throws {SavedTabsRepositoryUnavailableError} chrome.storage.local 不在時
 */
export const createChromeUserSettingsRepository = (
  port: ChromeUserSettingsStoragePort | null = getDefaultPort(),
): UserSettingsRepository => {
  if (!port) {
    warnMissingChromeStorage('ChromeUserSettingsRepository')
    throw new SavedTabsRepositoryUnavailableError(
      'chrome.storage.local が利用できないため ChromeUserSettingsRepository を初期化できません',
    )
  }
  return createChromeUserSettingsRepositoryImpl(port)
}
