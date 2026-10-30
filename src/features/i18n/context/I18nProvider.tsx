import { useEffect, useMemo, useState } from 'react'

import {
  getBrowserUiLocale,
  getMessage,
  getStoredLanguageSetting,
  resolveLanguage,
} from '@/features/i18n/lib/language'
import type { LanguageSetting } from '@/features/i18n/messages'
import type { StorageChange } from '@/lib/browser/chrome-storage'
import {
  getChromeStorageOnChanged,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import {
  defaultSettings,
  getUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'

import { I18nContext } from './I18nContext'
import type { I18nContextValue } from './I18nContext'

export { useI18n, useOptionalI18n } from './I18nContext'

const getUiLocale = () =>
  getBrowserUiLocale(
    typeof navigator === 'undefined' ? undefined : navigator.language,
  )

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [i18nState, setI18nState] = useState<{
    languageSetting: LanguageSetting
    uiLocale: string | undefined
  }>(() => ({
    languageSetting: defaultSettings.language ?? 'system',
    uiLocale: getUiLocale(),
  }))
  const { languageSetting, uiLocale } = i18nState

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const settings = await getUserSettings()
        if (!cancelled) {
          setI18nState({
            languageSetting: settings.language ?? 'system',
            uiLocale: getUiLocale(),
          })
        }
      } catch (error) {
        console.error('言語設定の読み込みエラー:', error)
      }
    }

    void load()

    const storageOnChanged = getChromeStorageOnChanged()
    if (!storageOnChanged) {
      warnMissingChromeStorage('言語設定変更監視')
      return () => {
        cancelled = true
      }
    }

    const handleStorageChange = (
      changes: Partial<Record<string, StorageChange>>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes.userSettings?.newValue) {
        return
      }

      const nextLanguageSetting = getStoredLanguageSetting(
        changes.userSettings.newValue,
      )
      setI18nState({
        languageSetting: nextLanguageSetting,
        uiLocale: getUiLocale(),
      })
    }

    storageOnChanged.addListener(handleStorageChange)

    return () => {
      cancelled = true
      storageOnChanged.removeListener(handleStorageChange)
    }
  }, [])

  const setLanguageSetting = async (nextLanguage: LanguageSetting) => {
    setI18nState({
      languageSetting: nextLanguage,
      uiLocale: getUiLocale(),
    })

    const settings = await getUserSettings()
    await saveUserSettings({
      ...settings,
      language: nextLanguage,
    })
  }

  const language = resolveLanguage(languageSetting, uiLocale)

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      languageSetting,
      setLanguageSetting,
      t: (key, fallback, values) => getMessage(language, key, fallback, values),
    }),
    [language, languageSetting],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export type TranslateFn = I18nContextValue['t']
