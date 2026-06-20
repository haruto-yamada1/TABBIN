import {
  getBrowserUiLocale,
  getMessage,
  resolveUiLanguage,
} from '@/features/i18n/lib/language'

const getUiLocale = () =>
  getBrowserUiLocale(
    typeof navigator === 'undefined' ? undefined : navigator.language,
  )

export const getFallbackText = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => getMessage(resolveUiLanguage(getUiLocale()), key, fallback, values)
