import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { getMessage, resolveLanguage } from '@/features/i18n/lib/language'
import type { LanguageSetting } from '@/features/i18n/messages'

import { I18nContext } from './I18nContext'
import type { I18nContextValue } from './I18nContext'

/** An isolated language scope: no settings reads, repair writes or subscriptions. */
export const MemoryI18nProvider = ({
  children,
  initialLanguage = 'en',
}: {
  children: ReactNode
  initialLanguage?: LanguageSetting
}) => {
  const [setting, setSetting] = useState(initialLanguage)
  const language = resolveLanguage(setting, navigator.language)
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      languageSetting: setting,
      setLanguageSetting: async (next) => {
        setSetting(next)
        await Promise.resolve()
      },
      t: (key, fallback, values) => getMessage(language, key, fallback, values),
    }),
    [language, setting],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
