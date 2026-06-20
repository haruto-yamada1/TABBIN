import {
  getBrowserUiLocale,
  getMessage,
  resolveLanguage,
} from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'
import type { AiSystemPromptPreset, UserSettings } from '@/types/storage'

const isNonEmptyArray = <T>(arr: T[]): arr is [T, ...T[]] => arr.length > 0

const DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID = 'default-system-prompt'
const MAX_AI_SYSTEM_PROMPT_PRESETS = 50
const MAX_AI_SYSTEM_PROMPT_NAME_LENGTH = 25
const SAVED_URL_CONTEXT_PLACEHOLDER = '{{saved_url_context}}'

const DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE = getMessage(
  'ja',
  'aiChat.systemPrompt.defaultTemplate',
)

const getCurrentUiLocale = () => getBrowserUiLocale('ja')

const getCurrentAppLanguage = (): AppLanguage =>
  resolveLanguage('system', getCurrentUiLocale())

const getDefaultAiSystemPromptName = (
  language: AppLanguage = getCurrentAppLanguage(),
): string => getMessage(language, 'aiChat.systemPrompt.defaultName')

const getDefaultAiSystemPromptTemplate = (
  language: AppLanguage = getCurrentAppLanguage(),
): string => getMessage(language, 'aiChat.systemPrompt.defaultTemplate')

const createDefaultAiSystemPromptPreset = (
  language: AppLanguage = getCurrentAppLanguage(),
): AiSystemPromptPreset => ({
  createdAt: 0,
  id: DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
  name: getDefaultAiSystemPromptName(language),
  template: getDefaultAiSystemPromptTemplate(language),
  updatedAt: 0,
})

type NonEmptyAiSystemPromptPresets = [
  AiSystemPromptPreset,
  ...AiSystemPromptPreset[],
]

type NormalizedAiSystemPromptSettings = Omit<
  UserSettings,
  'activeAiSystemPromptId' | 'aiSystemPrompts'
> & {
  activeAiSystemPrompt: AiSystemPromptPreset
  activeAiSystemPromptId: string
  aiSystemPrompts: NonEmptyAiSystemPromptPresets
}

const isValidPromptPreset = (value: unknown): value is AiSystemPromptPreset => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if (
    !(
      'id' in value &&
      'name' in value &&
      'template' in value &&
      'createdAt' in value &&
      'updatedAt' in value
    )
  ) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.template === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number'
  )
}

const normalizePromptName = (name: string): string =>
  name.trim().slice(0, MAX_AI_SYSTEM_PROMPT_NAME_LENGTH)

const normalizePromptPreset = (
  preset: AiSystemPromptPreset,
  language: AppLanguage = getCurrentAppLanguage(),
): AiSystemPromptPreset => {
  const normalizedName = normalizePromptName(preset.name)
  const normalizedTemplate = preset.template.trim()
  const isBuiltInDefaultPreset =
    preset.id === DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID &&
    [
      getDefaultAiSystemPromptName('ja'),
      getDefaultAiSystemPromptName('en'),
    ].includes(normalizedName) &&
    [
      getDefaultAiSystemPromptTemplate('ja'),
      getDefaultAiSystemPromptTemplate('en'),
    ].includes(normalizedTemplate)

  return {
    ...preset,
    name: isBuiltInDefaultPreset
      ? getDefaultAiSystemPromptName(language)
      : normalizedName,
    template: isBuiltInDefaultPreset
      ? getDefaultAiSystemPromptTemplate(language)
      : normalizedTemplate,
  }
}

const normalizePromptPresets = (
  presets: UserSettings['aiSystemPrompts'],
  language: AppLanguage = getCurrentAppLanguage(),
): NonEmptyAiSystemPromptPresets => {
  const normalizedPresets = Array.isArray(presets)
    ? presets
        .reduce<AiSystemPromptPreset[]>((items, preset) => {
          if (!isValidPromptPreset(preset)) {
            return items
          }

          const normalizedPreset = normalizePromptPreset(preset, language)
          if (
            normalizedPreset.name.length > 0 &&
            normalizedPreset.template.length > 0
          ) {
            items.push(normalizedPreset)
          }
          return items
        }, [])
        .slice(0, MAX_AI_SYSTEM_PROMPT_PRESETS)
    : []

  return isNonEmptyArray(normalizedPresets)
    ? normalizedPresets
    : [createDefaultAiSystemPromptPreset(language)]
}

const normalizeAiSystemPromptSettings = (
  settings: UserSettings,
): NormalizedAiSystemPromptSettings => {
  const language = resolveLanguage(
    settings.language ?? 'system',
    getCurrentUiLocale(),
  )
  const aiSystemPrompts = normalizePromptPresets(
    settings.aiSystemPrompts,
    language,
  )
  const activeAiSystemPrompt =
    aiSystemPrompts.find(
      (prompt) => prompt.id === settings.activeAiSystemPromptId,
    ) ?? aiSystemPrompts[0]

  return {
    ...settings,
    activeAiSystemPrompt,
    activeAiSystemPromptId: activeAiSystemPrompt.id,
    aiSystemPrompts,
  }
}

const getActiveAiSystemPrompt = (
  settings: Pick<UserSettings, 'activeAiSystemPromptId' | 'aiSystemPrompts'>,
): AiSystemPromptPreset => {
  const aiSystemPrompts = normalizePromptPresets(settings.aiSystemPrompts)
  return (
    aiSystemPrompts.find(
      (prompt) => prompt.id === settings.activeAiSystemPromptId,
    ) ?? aiSystemPrompts[0]
  )
}

const buildFinalSystemPrompt = ({
  savedUrlContext,
  template,
}: {
  savedUrlContext: string
  template: string
}): string => {
  const normalizedTemplate = template.trim()
  if (normalizedTemplate.includes(SAVED_URL_CONTEXT_PLACEHOLDER)) {
    return normalizedTemplate.replace(
      SAVED_URL_CONTEXT_PLACEHOLDER,
      savedUrlContext,
    )
  }

  return [normalizedTemplate, savedUrlContext].join('\n\n')
}

const createAiSystemPromptPreset = ({
  id,
  language = getCurrentAppLanguage(),
  name,
  now = Date.now(),
  template = getDefaultAiSystemPromptTemplate(language),
}: {
  id: string
  language?: AppLanguage
  name: string
  now?: number
  template?: string
}): AiSystemPromptPreset => ({
  createdAt: now,
  id,
  name: normalizePromptName(name),
  template,
  updatedAt: now,
})

export {
  DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
  DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE,
  MAX_AI_SYSTEM_PROMPT_NAME_LENGTH,
  MAX_AI_SYSTEM_PROMPT_PRESETS,
  SAVED_URL_CONTEXT_PLACEHOLDER,
  buildFinalSystemPrompt,
  createAiSystemPromptPreset,
  getActiveAiSystemPrompt,
  normalizeAiSystemPromptSettings,
}
