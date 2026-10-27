import { DEFAULT_FONT_SIZE_PERCENT } from '@/constants/fontSize'
import { OLLAMA_BASE_URL } from '@/constants/productionNetworkPolicy'
import {
  DEFAULT_EXCLUDE_PATTERNS,
  mergeStoredUserSettingsDefaults,
  savedTabsActionSettingsDefaults,
} from '@/contexts/saved-tabs/public-api'
import {
  DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
  DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import { withUserSettingsLock } from '@/lib/storage/userSettingsLock'
import {
  parseStoredUserSettings,
  savedSearchesSchema,
  UserSettingsSchema,
} from '@/lib/storage/zod-storage'
import type { UserSettings } from '@/types/storage'

const stripLegacyUserSettings = (settings: unknown): Partial<UserSettings> => {
  if (!isStrippableSettings(settings)) {
    return defaultSettings
  }
  const { aiChatEnabled: _ae, aiProvider: _ap, ...rest } = settings
  return rest
}

const isStrippableSettings = (
  settings: unknown,
): settings is Record<string, unknown> =>
  // OK: chrome.storage.local.get always returns object; safe after runtime type guard
  typeof settings === 'object' && settings !== null

const hasLegacyUserSettingsKeys = (settings: unknown): boolean =>
  typeof settings === 'object' &&
  settings !== null &&
  ('aiChatEnabled' in settings || 'aiProvider' in settings)
const mergeStoredUserSettings = (
  settings: Partial<UserSettings>,
): UserSettings => mergeStoredUserSettingsDefaults(defaultSettings, settings)

type GetUserSettingsOptions = {
  readonly repairStoredSettings?: boolean
}

const storedSearches = (raw: unknown): { savedSearches?: unknown } => {
  if (raw === undefined) {
    return {}
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Stored user settings are invalid')
  }
  return 'savedSearches' in raw ? { savedSearches: raw.savedSearches } : {}
}

const repairSettings = async (
  storage: NonNullable<ReturnType<typeof getChromeStorageLocal>>,
) => {
  try {
    await withUserSettingsLock(async () => {
      const current = await storage.get(['userSettings'])
      const raw: unknown = Reflect.get(current, 'userSettings')
      const sanitized = parseStoredUserSettings(stripLegacyUserSettings(raw))
      const repaired = normalizeAiSystemPromptSettings(
        mergeStoredUserSettings(sanitized),
      )
      await storage.set({
        userSettings: { ...repaired, ...storedSearches(raw) },
      })
    })
  } catch (error) {
    console.error('設定の修復エラー:', error)
  }
}

// デフォルト設定
export const defaultSettings: UserSettings = {
  language: 'system',
  ...savedTabsActionSettingsDefaults,
  excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS],
  enableCategories: true,
  // デフォルトは有効
  autoDeletePeriod: 'never',
  // デフォルトでは自動削除しない
  showRelativeSavedTime: false,
  showSavedTime: false,
  // デフォルトでは表示しない
  clickBehavior: 'saveSameDomainTabs',
  // デフォルトは「現在開いているドメインのタブをすべて保存」
  excludePinnedTabs: true,
  // デフォルトでは固定タブを除外する
  openUrlInBackground: true,
  // デフォルト: URLをバックグラウンドで開く
  fontSizePercent: DEFAULT_FONT_SIZE_PERCENT,
  colors: {}, // デフォルト: カラー設定まとめ
  ollamaModel: '',
  ollamaBaseUrl: OLLAMA_BASE_URL,
  activeAiSystemPromptId: DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
  aiSystemPrompts: [
    {
      createdAt: 0,
      id: DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
      name: 'デフォルト',
      template: DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE,
      updatedAt: 0,
    },
  ],
}

// 設定を取得する関数
export const getUserSettings = async (
  options: GetUserSettingsOptions = {},
): Promise<UserSettings> => {
  try {
    const storageLocal = getChromeStorageLocal()
    if (!storageLocal) {
      warnMissingChromeStorage('設定読み込み')
      return {
        ...defaultSettings,
      }
    }
    const data = await storageLocal.get(['userSettings'])
    if (Object.hasOwn(data, 'userSettings')) {
      const sanitizedStoredSettings = parseStoredUserSettings(
        stripLegacyUserSettings(data.userSettings),
      )
      const mergedStoredSettings = mergeStoredUserSettings(
        sanitizedStoredSettings,
      )
      const normalizedSettings = normalizeAiSystemPromptSettings({
        ...defaultSettings,
        ...mergedStoredSettings,
      })
      if (
        options.repairStoredSettings !== false &&
        (hasLegacyUserSettingsKeys(data.userSettings) ||
          JSON.stringify(sanitizedStoredSettings.excludePatterns ?? []) !==
            JSON.stringify(mergedStoredSettings.excludePatterns))
      ) {
        await repairSettings(storageLocal)
      }
      // デフォルト値とマージして返す
      return { ...normalizedSettings }
    }
    return {
      ...normalizeAiSystemPromptSettings({
        ...defaultSettings,
      }),
    }
  } catch (error) {
    console.error('設定取得エラー:', error)
    return {
      ...normalizeAiSystemPromptSettings({
        ...defaultSettings,
      }),
    }
  }
}

export const readUserSettingsWithoutRepair =
  async (): Promise<UserSettings> => {
    const storage = getChromeStorageLocal()
    if (!storage) {
      throw new Error('User settings storage is unavailable')
    }
    const data = await storage.get(['userSettings'])
    const raw: unknown = Reflect.get(data, 'userSettings')
    const searches = storedSearches(raw)
    if ('savedSearches' in searches) {
      savedSearchesSchema.parse(searches.savedSearches)
    }
    const settings = parseStoredUserSettings(stripLegacyUserSettings(raw))
    return normalizeAiSystemPromptSettings(mergeStoredUserSettings(settings))
  }

/** Returns the settings that the storage writer will persist. */
export const normalizeUserSettingsForStorage = (
  settings: UserSettings,
): UserSettings => {
  UserSettingsSchema.shape.ollamaBaseUrl.parse(settings.ollamaBaseUrl)
  const validatedSettings = parseStoredUserSettings(settings)
  return normalizeAiSystemPromptSettings(
    mergeStoredUserSettings(validatedSettings),
  )
}

// 設定を保存する関数
export const saveUserSettings = async (
  settings: UserSettings,
): Promise<void> => {
  try {
    const normalizedSettings = normalizeUserSettingsForStorage(settings)
    const storageLocal = getChromeStorageLocal()
    if (!storageLocal) {
      warnMissingChromeStorage('設定保存')
      return
    }
    await withUserSettingsLock(async () => {
      const current = await storageLocal.get(['userSettings'])
      const raw: unknown = Reflect.get(current, 'userSettings')
      const { savedSearches: _savedSearches, ...otherSettings } =
        normalizedSettings
      await storageLocal.set({
        userSettings: { ...otherSettings, ...storedSearches(raw) },
      })
    })
  } catch (error) {
    console.error('設定保存エラー:', error)
    throw error
  }
}

/** Caller must hold the settings lock for the entire import or recovery. */
export const replaceUserSettingsWhileLocked = async (
  settings: UserSettings,
): Promise<void> => {
  const storage = getChromeStorageLocal()
  if (!storage) {
    throw new Error('User settings storage is unavailable')
  }
  await storage.set({ userSettings: normalizeUserSettingsForStorage(settings) })
}
