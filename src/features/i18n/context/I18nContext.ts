import { createContext, use } from 'react'

import type { AppLanguage, LanguageSetting } from '@/features/i18n/messages'

export type I18nContextValue = {
  language: AppLanguage
  languageSetting: LanguageSetting
  setLanguageSetting: (language: LanguageSetting) => Promise<void>
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export const useI18n = () => {
  const context = use(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}

export const useOptionalI18n = () => use(I18nContext)
