import { getMessage, resolveLanguage } from '@/features/i18n/lib/language'
import type { AppLanguage, LanguageSetting } from '@/features/i18n/messages'

export type TitlePageKey =
  | 'aiChat'
  | 'app'
  | 'analytics'
  | 'changelog'
  | 'options'
  | 'periodicExecution'
  | 'savedTabs'

export const resolveTitleKey = (page: TitlePageKey) =>
  `htmlTitle.${page}` as const

export const getDocumentTitle = (
  language: AppLanguage,
  page: TitlePageKey,
): string => getMessage(language, resolveTitleKey(page))

export const resolveDocumentTitle = (
  languageSetting: LanguageSetting,
  uiLocale: string | undefined,
  page: TitlePageKey,
): string => {
  const language = resolveLanguage(languageSetting, uiLocale)
  return getDocumentTitle(language, page)
}

export const resolveTitlePageKeyFromPathname = (
  pathname: string,
): TitlePageKey => {
  const normalizedPathname =
    pathname.replace(/\/+$/, '').replace(/\.html$/, '') || '/'

  switch (normalizedPathname) {
    case '/ai-chat': {
      return 'aiChat'
    }
    case '/analytics': {
      return 'analytics'
    }
    case '/changelog': {
      return 'changelog'
    }
    case '/options': {
      return 'options'
    }
    case '/periodic-execution': {
      return 'periodicExecution'
    }
    case '/saved-tabs': {
      return 'savedTabs'
    }
    default: {
      return 'app'
    }
  }
}

export const resolveDocumentTitleFromPathname = (
  pathname: string,
  languageSetting: LanguageSetting,
  uiLocale: string | undefined,
): string => {
  const page = resolveTitlePageKeyFromPathname(pathname)
  return resolveDocumentTitle(languageSetting, uiLocale, page)
}
