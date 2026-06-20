import { getMessages } from '@/features/i18n/messages'
import type { AppLanguage, LanguageSetting } from '@/features/i18n/messages'

const DEFAULT_LANGUAGE: AppLanguage = 'en'

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null

export const getBrowserUiLocale = (fallback?: string): string | undefined => {
  const chromeValue: unknown = Reflect.get(globalThis, 'chrome')
  if (!isRecord(chromeValue)) {
    return fallback
  }
  const i18nValue = chromeValue.i18n
  if (!isRecord(i18nValue)) {
    return fallback
  }
  const getUiLanguage = i18nValue.getUILanguage
  if (typeof getUiLanguage !== 'function') {
    return fallback
  }
  const locale: unknown = getUiLanguage.call(i18nValue)
  return typeof locale === 'string' ? locale : fallback
}

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
  const currentMessages: Partial<Record<string, string>> = getMessages(language)
  const englishMessages: Partial<Record<string, string>> = getMessages('en')
  const template = currentMessages[key] ?? englishMessages[key] ?? fallback

  return template.replaceAll(
    /\{\{(\w+)\}\}/g,
    (match: string, token: string) => values?.[token] ?? match,
  )
}
