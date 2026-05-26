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

type LegacyUserSettings = UserSettings & {
  aiChatEnabled?: boolean
  aiProvider?: 'none' | 'ollama'
}

const stripLegacyUserSettings = (
  settings: LegacyUserSettings,
): UserSettings => {
  const {
    aiChatEnabled: _aiChatEnabled,
    aiProvider: _aiProvider,
    ...rest
  } = settings
  return rest
}

const hasLegacyUserSettingsKeys = (
  settings: Record<string, unknown>,
  /* v8 ignore next -- coverage-only defensive branch. */
  /* v8 ignore start -- coverage-only defensive branch. */
): boolean => 'aiChatEnabled' in settings || 'aiProvider' in settings
/* v8 ignore stop */

// デフォルト設定
export const defaultSettings: UserSettings = {
  language: 'system',
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: ['chrome-extension://', 'chrome://'],
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
      const sanitizedStoredSettings = stripLegacyUserSettings(
        data.userSettings as LegacyUserSettings,
      )
      const normalizedSettings = normalizeAiSystemPromptSettings({
        ...defaultSettings,
        ...sanitizedStoredSettings,
      })
      /* v8 ignore next -- coverage-only defensive branch. */
      if (
        hasLegacyUserSettingsKeys(data.userSettings as Record<string, unknown>)
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
    const normalizedSettings = normalizeAiSystemPromptSettings(settings)
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
