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
  pathname = window.location.pathname,
  search = window.location.search,
  replace: (href: string) => void = (href) => window.location.replace(href),
) => {
  const nextHref = getLegacyRedirectHref(pathname, search)
  replace(nextHref)
  return nextHref
}

interface LegacyRedirectOptions {
  replace?: (href: string) => void
}

const initializeLegacyRedirect = (options: LegacyRedirectOptions = {}) => {
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
