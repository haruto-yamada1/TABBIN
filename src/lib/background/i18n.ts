import { getMessage, resolveLanguage } from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'
import { getUserSettings } from '@/lib/storage/settings'

const getBackgroundUiLocale = () => chrome.i18n?.getUILanguage?.() ?? 'ja'

const getBackgroundLanguage = async (): Promise<AppLanguage> => {
  try {
    const settings = await getUserSettings()

    return resolveLanguage(
      settings.language ?? 'system',
      getBackgroundUiLocale(),
    )
  } catch {
    return 'ja'
  }
}

const getBackgroundMessage = async (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
): Promise<string> => {
  const language = await getBackgroundLanguage()

  return getMessage(language, key, fallback, values)
}

export { getBackgroundLanguage, getBackgroundMessage }
