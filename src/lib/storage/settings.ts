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
import {
  parseStoredUserSettings,
  strictStoredUserSettingsSchema,
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
  // デフォルトでは保存日時を表示しない
  showOpenTabs: true,
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

export type UserSettingsReadResult =
  | { readonly status: 'available'; readonly settings: UserSettings }
  | { readonly status: 'missing'; readonly settings: UserSettings }
  | { readonly status: 'unavailable' }
  | { readonly status: 'invalid' }

export class UserSettingsReadError extends Error {
  public readonly status: 'unavailable' | 'invalid'

  public constructor(status: 'unavailable' | 'invalid') {
    super(
      'Settings could not be verified. Reload or recover settings in Options.',
    )
    this.name = 'UserSettingsReadError'
    this.status = status
  }
}

const normalizeStoredSettings = (stored: unknown): UserSettings =>
  normalizeAiSystemPromptSettings(
    mergeStoredUserSettings(
      parseStoredUserSettings(stripLegacyUserSettings(stored)),
    ),
  )

/** Reads policy without repair writes. Missing legacy fields retain their defaults. */
export const readUserSettingsStrict =
  async (): Promise<UserSettingsReadResult> => {
    try {
      const storageLocal = getChromeStorageLocal()
      if (!storageLocal) {
        return { status: 'unavailable' }
      }
      const data: { readonly userSettings?: unknown } = await storageLocal.get([
        'userSettings',
      ])
      if (data.userSettings === undefined) {
        return { status: 'missing', settings: normalizeStoredSettings({}) }
      }
      if (
        !strictStoredUserSettingsSchema.safeParse(data.userSettings).success
      ) {
        return { status: 'invalid' }
      }
      return {
        status: 'available',
        settings: normalizeStoredSettings(data.userSettings),
      }
    } catch {
      return { status: 'unavailable' }
    }
  }

/** Use at mutation boundaries; never treat a display fallback as policy. */
export const requireUserSettings = async (): Promise<UserSettings> => {
  const result = await readUserSettingsStrict()
  if (result.status === 'invalid' || result.status === 'unavailable') {
    throw new UserSettingsReadError(result.status)
  }
  return result.settings
}

// Display-only tolerant read. Repair cannot authorize a mutation or replace a valid read.
export const getUserSettings = async (
  options: GetUserSettingsOptions = {},
): Promise<UserSettings> => {
  try {
    const storageLocal = getChromeStorageLocal()
    if (!storageLocal) {
      warnMissingChromeStorage('設定読み込み')
      return { ...defaultSettings }
    }
    const data: { readonly userSettings?: unknown } = await storageLocal.get([
      'userSettings',
    ])
    const normalizedSettings = normalizeStoredSettings(data.userSettings ?? {})
    if (
      data.userSettings !== undefined &&
      strictStoredUserSettingsSchema.safeParse(data.userSettings).success &&
      options.repairStoredSettings !== false &&
      (hasLegacyUserSettingsKeys(data.userSettings) ||
        JSON.stringify(
          parseStoredUserSettings(data.userSettings).excludePatterns ?? [],
        ) !== JSON.stringify(normalizedSettings.excludePatterns))
    ) {
      try {
        await storageLocal.set({ userSettings: normalizedSettings })
      } catch {
        console.error('設定の修復に失敗しました')
      }
    }
    return { ...normalizedSettings }
  } catch {
    console.error('設定の読み込みに失敗しました')
    return normalizeStoredSettings({})
  }
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

// Settings writes require a verified current value, even when a caller displayed defaults.
export const saveUserSettings = async (
  settings: UserSettings,
): Promise<void> => {
  const normalizedSettings = normalizeUserSettingsForStorage(settings)
  await requireUserSettings()
  const storageLocal = getChromeStorageLocal()
  if (!storageLocal) {
    throw new UserSettingsReadError('unavailable')
  }
  await storageLocal.set({ userSettings: normalizedSettings })
}

/** Explicit recovery action. Never reset settings automatically after a read failure. */
export const resetInvalidUserSettings = async (): Promise<void> => {
  const result = await readUserSettingsStrict()
  if (result.status === 'unavailable') {
    throw new UserSettingsReadError(result.status)
  }
  if (result.status !== 'invalid') {
    return
  }
  const storageLocal = getChromeStorageLocal()
  if (!storageLocal) {
    throw new UserSettingsReadError('unavailable')
  }
  await storageLocal.set({ userSettings: normalizeStoredSettings({}) })
}
