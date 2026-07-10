import { resolveDocumentTitleFromPathname } from '@/features/i18n/lib/title'
import { getLegacyRedirectHref } from '@/features/navigation/lib/pageNavigation'

const syncDocumentTitle = (
  pathname = window.location.pathname,
  uiLocale = window.navigator.language,
) => {
  document.title = resolveDocumentTitleFromPathname(
    pathname,
    'system',
    uiLocale,
  )
  return document.title
}

const redirectToApp = (
  pathname: string,
  search: string,
  replace: (href: string) => void,
) => {
  const nextHref = getLegacyRedirectHref(pathname, search)
  replace(nextHref)
  return nextHref
}

type LegacyRedirectOptions = {
  replace: (href: string) => void
}

const initializeLegacyRedirect = (
  options: LegacyRedirectOptions = {
    replace: window.location.replace.bind(window.location),
  },
) => {
  document.addEventListener('DOMContentLoaded', () => {
    syncDocumentTitle()
    redirectToApp(
      window.location.pathname,
      window.location.search,
      options.replace,
    )
  })
}

export { initializeLegacyRedirect, redirectToApp, syncDocumentTitle }
