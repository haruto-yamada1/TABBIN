import { DEFAULT_FONT_SIZE_PERCENT } from '@/constants/fontSize'
import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import { savedTabsActionSettingsDefaults } from '@/contexts/saved-tabs/domain/services/SavedTabsActionSettingsPolicy'
import {
  DEFAULT_EXCLUDE_PATTERNS,
  mergeStoredUserSettingsDefaults,
} from '@/contexts/saved-tabs/domain/services/userSettingsDefaultsMerge'
import {
  DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
  DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import { parseStoredUserSettings } from '@/lib/storage/zod-storage'

/**
 * `UserSettingsDto` の domain 既定値。repository / use-case 初期値や未保存状態
 * のフォールバックとして利用する。データ変更とウィンドウ操作の既定値は
 * `savedTabsActionSettingsDefaults` を source of truth とする。
 *
 * 旧 `lib/storage/settings` の正規化 (`normalizeAiSystemPromptSettings`)
 * 適用前の素の値なので、利用側で `normalizeAiSystemPromptSettings` を
 * 通してから chrome.storage に書き戻すこと。
 *
 * `@/types/storage` には依存せず、domain DTO `UserSettingsDto` を
 * 用いる (issue #511)。
 */
export const defaultUserSettings: UserSettingsDto = {
  language: 'system',
  ...savedTabsActionSettingsDefaults,
  excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: true,
  openUrlInBackground: true,
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

const stripLegacyUserSettings = (
  settings: unknown,
): Partial<UserSettingsDto> => {
  if (!isStrippableSettings(settings)) {
    return defaultUserSettings
  }
  const { aiChatEnabled: _ae, aiProvider: _ap, ...rest } = settings
  return rest
}

const mergeStoredUserSettings = (
  settings: Partial<UserSettingsDto>,
): UserSettingsDto =>
  mergeStoredUserSettingsDefaults(defaultUserSettings, settings)

/**
 * `UserSettingsDto` → `normalizeAiSystemPromptSettings` 入力形へ投影する純関数。
 *
 * `normalizeAiSystemPromptSettings` が storage 形 `UserSettings` を
 * 受け取るため、内部で `excludePatterns` などのフィールドを
 * 新規インスタンスへコピーして渡す (issue #511)。
 *
 * 戻り値の型注釈は storage 形 UserSettings 互換の plain object。
 * 構造互換のため `as unknown as Parameters<...>[0]` キャストで
 * `@/types/storage.UserSettings` 注釈を回避する。
 */
const toStorageUserSettingsForNormalization = (
  dto: UserSettingsDto,
): Parameters<typeof normalizeAiSystemPromptSettings>[0] => {
  // OK: structural copy. `@/types/storage` への直接依存を避ける
  // ため、戻り値型は normalizeAiSystemPromptSettings の引数型を
  // 取り、storage 形 `UserSettings` と互換な plain object として
  // 構築する (issue #511)。
  return {
    ...dto,
    excludePatterns: [...dto.excludePatterns],
    aiSystemPrompts: dto.aiSystemPrompts?.map((preset) => ({ ...preset })),
    colors: dto.colors ? { ...dto.colors } : undefined,
  }
}

/**
 * `normalizeAiSystemPromptSettings` の戻り値を `UserSettingsDto` へ
 * 逆投影する。
 */
const fromNormalizedStorageUserSettings = (
  storage: Parameters<typeof normalizeAiSystemPromptSettings>[0],
): UserSettingsDto => ({
  ...storage,
  excludePatterns: [...storage.excludePatterns],
  aiSystemPrompts: storage.aiSystemPrompts?.map((preset) => ({
    ...preset,
  })),
  colors: storage.colors ? { ...storage.colors } : undefined,
})

/**
 * 保存済み `UserSettingsDto` の merge / 正規化 / 旧キー除去を 1 箇所に
 * 集約した純関数。`UserSettingsRepository` の chrome 実装が load / save
 * 時に必ず通す。
 */
export const normalizeUserSettings = (
  stored: unknown,
): {
  normalized: UserSettingsDto
  hasLegacyKeys: boolean
  excludePatternsChanged: boolean
} => {
  if (isStrippableSettings(stored) && stored.userSettings) {
    const raw = stored.userSettings
    const sanitizedStoredSettings = parseStoredUserSettings(
      stripLegacyUserSettings(raw),
    )
    const mergedStoredSettings = mergeStoredUserSettings(
      sanitizedStoredSettings,
    )
    const normalized = normalizeAiSystemPromptSettings(
      toStorageUserSettingsForNormalization({
        ...defaultUserSettings,
        ...mergedStoredSettings,
      }),
    )
    const excludePatternsChanged =
      JSON.stringify(sanitizedStoredSettings.excludePatterns ?? []) !==
      JSON.stringify(mergedStoredSettings.excludePatterns)
    return {
      excludePatternsChanged,
      hasLegacyKeys: hasLegacyUserSettingsKeys(raw),
      normalized: fromNormalizedStorageUserSettings(normalized),
    }
  }
  return {
    excludePatternsChanged: false,
    hasLegacyKeys: false,
    normalized: fromNormalizedStorageUserSettings(
      normalizeAiSystemPromptSettings(
        toStorageUserSettingsForNormalization({
          ...defaultUserSettings,
        }),
      ),
    ),
  }
}
