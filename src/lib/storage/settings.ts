import { DEFAULT_FONT_SIZE_PERCENT } from '@/constants/fontSize'
import {
  DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
  DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import type { UserSettings } from '@/types/storage'

const DEFAULT_EXCLUDE_PATTERNS = [
  'about:',
  'chrome-extension://',
  'chrome://',
] as const

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
const mergeExcludePatterns = (
  excludePatterns: string[] | undefined,
): string[] => {
  const mergedPatterns = new Set<string>(DEFAULT_EXCLUDE_PATTERNS)

  for (const pattern of excludePatterns ?? []) {
    if (typeof pattern !== 'string') {
      continue
    }
    const normalizedPattern = pattern.trim()
    if (normalizedPattern) {
      mergedPatterns.add(normalizedPattern)
    }
  }

  return [...mergedPatterns]
}

const mergeStoredUserSettings = (
  settings: Partial<UserSettings>,
): UserSettings =>
  // OK: callers always spread result with defaultSettings which provides all required fields
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  ({
    ...settings,
    excludePatterns: mergeExcludePatterns(settings.excludePatterns),
  }) as UserSettings

// デフォルト設定
export const defaultSettings: UserSettings = {
  language: 'system',
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS],
  enableCategories: true,
  // デフォルトは有効
  autoDeletePeriod: 'never',
  // デフォルトでは自動削除しない
  showSavedTime: false,
  // デフォルトでは表示しない
  clickBehavior: 'saveSameDomainTabs',
  // デフォルトは「現在開いているドメインのタブをすべて保存」
  excludePinnedTabs: true,
  // デフォルトでは固定タブを除外する
  openUrlInBackground: true,
  // デフォルト: URLをバックグラウンドで開く
  openAllInNewWindow: false,
  // デフォルト: 「すべてのタブを開く」を現在のウィンドウで開く
  confirmDeleteAll: false,
  // デフォルト: 確認しない
  confirmDeleteEach: false,
  fontSizePercent: DEFAULT_FONT_SIZE_PERCENT,
  // デフォルト: 確認しない
  colors: {}, // デフォルト: カラー設定まとめ
  ollamaModel: '',
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
export const getUserSettings = async (): Promise<UserSettings> => {
  try {
    console.log('ユーザー設定を取得中...')
    const storageLocal = getChromeStorageLocal()
    if (!storageLocal) {
      warnMissingChromeStorage('設定読み込み')
      return {
        ...defaultSettings,
      }
    }
    const data = await storageLocal.get(['userSettings'])
    console.log('取得した設定データ:', data)
    if (data.userSettings) {
      console.log('保存された設定を使用:', data.userSettings)
      const sanitizedStoredSettings = stripLegacyUserSettings(data.userSettings)
      const mergedStoredSettings = mergeStoredUserSettings(
        sanitizedStoredSettings,
      )
      const normalizedSettings = normalizeAiSystemPromptSettings({
        ...defaultSettings,
        ...mergedStoredSettings,
      })
      if (
        hasLegacyUserSettingsKeys(data.userSettings) ||
        JSON.stringify(sanitizedStoredSettings.excludePatterns ?? []) !==
          JSON.stringify(mergedStoredSettings.excludePatterns)
      ) {
        await storageLocal.set({
          userSettings: normalizedSettings,
        })
      }
      // デフォルト値とマージして返す
      return { ...normalizedSettings }
    }
    console.log('設定が見つからないためデフォルト値を使用')
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
} // 設定を保存する関数
export const saveUserSettings = async (
  settings: UserSettings,
): Promise<void> => {
  try {
    const normalizedSettings = normalizeAiSystemPromptSettings(
      mergeStoredUserSettings(settings),
    )
    console.log('ユーザー設定を保存:', normalizedSettings)
    const storageLocal = getChromeStorageLocal()
    if (!storageLocal) {
      warnMissingChromeStorage('設定保存')
      return
    }
    await storageLocal.set({
      userSettings: normalizedSettings,
    })
    console.log('設定を保存しました')
  } catch (error) {
    console.error('設定保存エラー:', error)
    throw error
  }
}
