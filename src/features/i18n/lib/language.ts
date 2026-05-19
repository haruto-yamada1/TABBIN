import { getMessages } from '@/features/i18n/messages'
import type { AppLanguage, LanguageSetting } from '@/features/i18n/messages'

const DEFAULT_LANGUAGE: AppLanguage = 'en'

export const resolveUiLanguage = (
  uiLocale: string | undefined,
): AppLanguage => {
  const normalized = uiLocale?.trim().toLowerCase()

  if (normalized?.startsWith('ja')) {
    return 'ja'
  }

  if (normalized?.startsWith('en')) {
    return 'en'
  }

  return DEFAULT_LANGUAGE
}

export const resolveLanguage = (
  setting: LanguageSetting,
  uiLocale: string | undefined,
): AppLanguage => {
  if (setting === 'system') {
    return resolveUiLanguage(uiLocale)
  }

  return setting
}

export const getMessage = (
  language: AppLanguage,
  key: string,
  fallback = key,
  values?: Record<string, string>,
): string => {
  const currentMessages = getMessages(language) as Record<string, string>
  const englishMessages = getMessages('en') as Record<string, string>
  const template = currentMessages[key] ?? englishMessages[key] ?? fallback

  return template.replaceAll(
    /\{\{(\w+)\}\}/g,
    (match: string, token: string) => values?.[token] ?? match,
  )
}
