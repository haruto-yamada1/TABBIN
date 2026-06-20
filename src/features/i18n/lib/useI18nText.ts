import { useMemo } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  getBrowserUiLocale,
  getMessage,
  resolveUiLanguage,
} from '@/features/i18n/lib/language'

const getUiLocale = () =>
  getBrowserUiLocale(
    typeof navigator === 'undefined' ? undefined : navigator.language,
  )

const readI18n = useI18n

export const getFallbackText = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => getMessage(resolveUiLanguage(getUiLocale()), key, fallback, values)

export const useI18nText = () => {
  let t:
    | ((
        key: string,
        fallback?: string,
        values?: Record<string, string>,
      ) => string)
    | undefined

  try {
    ;({ t } = readI18n())
  } catch {
    t = undefined
  }

  return useMemo(
    () => (key: string, fallback?: string, values?: Record<string, string>) =>
      t?.(key, fallback, values) ?? getFallbackText(key, fallback, values),
    [t],
  )
}
