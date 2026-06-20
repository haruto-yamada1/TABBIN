import { getMessage, resolveUiLanguage } from '@/features/i18n/lib/language'

const getUiLocale = () => {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage()
  }

  return navigator.language
}

export const getFallbackText = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => getMessage(resolveUiLanguage(getUiLocale()), key, fallback, values)
