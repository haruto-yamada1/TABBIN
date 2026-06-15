import { DEFAULT_FONT_SIZE_PERCENT } from '@/constants/fontSize'
import {
  DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
  DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import type { UserSettings } from '@/types/storage'

const DEFAULT_EXCLUDE_PATTERNS = [
  'about:',
  'chrome-extension://',
  'chrome://',
] as const

/**
 * `UserSettings` の domain 既定値。`src/lib/storage/settings.defaultSettings`
 * を DDD 側に再配置したもので、repository / use-case 初期値や未保存状態
 * のフォールバックとして利用する。
 *
 * 旧 `lib/storage/settings` の正規化 (`normalizeAiSystemPromptSettings`)
 * 適用前の素の値なので、利用側で `normalizeAiSystemPromptSettings` を
 * 通してから chrome.storage に書き戻すこと。
 */
export const defaultUserSettings: UserSettings = {
  language: 'system',
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: true,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  fontSizePercent: DEFAULT_FONT_SIZE_PERCENT,
  colors: {},
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

const isStrippableSettings = (
  settings: unknown,
): settings is Record<string, unknown> =>
  // OK: chrome.storage.local.get always returns object; safe after runtime type guard
  typeof settings === 'object' && settings !== null

const hasLegacyUserSettingsKeys = (settings: unknown): boolean =>
  typeof settings === 'object' &&
  settings !== null &&
  ('aiChatEnabled' in settings || 'aiProvider' in settings)

const stripLegacyUserSettings = (settings: unknown): Partial<UserSettings> => {
  if (!isStrippableSettings(settings)) {
    return defaultUserSettings
  }
  const { aiChatEnabled: _ae, aiProvider: _ap, ...rest } = settings
  return rest
}

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
  // OK: callers always spread result with defaultUserSettings which provides all required fields
  // eslint-disable-next-line typescript/no-unsafe-type-assertion
  ({
    ...settings,
    excludePatterns: mergeExcludePatterns(settings.excludePatterns),
  }) as UserSettings

/**
 * 保存済み `UserSettings` の merge / 正規化 / 旧キー除去を 1 箇所に
 * 集約した純関数。`UserSettingsRepository` の chrome 実装が load / save
 * 時に必ず通す。
 */
export const normalizeUserSettings = (
  stored: unknown,
): {
  normalized: UserSettings
  hasLegacyKeys: boolean
  excludePatternsChanged: boolean
} => {
  if (isStrippableSettings(stored) && stored.userSettings) {
    const raw = stored.userSettings
    const sanitizedStoredSettings = stripLegacyUserSettings(raw)
    const mergedStoredSettings = mergeStoredUserSettings(
      sanitizedStoredSettings,
    )
    const normalized = normalizeAiSystemPromptSettings({
      ...defaultUserSettings,
      ...mergedStoredSettings,
    })
    const excludePatternsChanged =
      JSON.stringify(sanitizedStoredSettings.excludePatterns ?? []) !==
      JSON.stringify(mergedStoredSettings.excludePatterns)
    return {
      excludePatternsChanged,
      hasLegacyKeys: hasLegacyUserSettingsKeys(raw),
      normalized,
    }
  }
  return {
    excludePatternsChanged: false,
    hasLegacyKeys: false,
    normalized: normalizeAiSystemPromptSettings({
      ...defaultUserSettings,
    }),
  }
}
