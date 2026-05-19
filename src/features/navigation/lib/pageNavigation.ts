import type { ViewMode } from '@/types/storage'

type SidebarItemId =
  | 'ai-chat'
  | 'analytics'
  | 'options'
  | 'periodic-execution'
  | 'saved-tabs-domain'
  | 'saved-tabs-custom'

interface SidebarState {
  expandedGroup: 'tab-list'
  item: SidebarItemId
}

const APP_ENTRY_PATH = 'app.html'

const getNormalizedPathname = (pathname: string): string => {
  const parts = pathname.split('/')
  return parts.at(-1) || 'saved-tabs.html'
}

const getSavedTabsModeFromLocation = (search: string): ViewMode => {
  const params = new URLSearchParams(search)
  const mode = params.get('mode')

  return mode === 'custom' ? 'custom' : 'domain'
}

const getSidebarStateFromLocation = (
  pathname: string,
  search: string,
): SidebarState => {
  const normalizedPathname = getNormalizedPathname(pathname)

  if (
    normalizedPathname === 'ai-chat.html' ||
    normalizedPathname === 'ai-chat'
  ) {
    return {
      expandedGroup: 'tab-list',
      item: 'ai-chat',
    }
  }

  if (
    normalizedPathname === 'analytics.html' ||
    normalizedPathname === 'analytics'
  ) {
    return {
      expandedGroup: 'tab-list',
      item: 'analytics',
    }
  }

  if (
    normalizedPathname === 'periodic-execution.html' ||
    normalizedPathname === 'periodic-execution'
  ) {
    return {
      expandedGroup: 'tab-list',
      item: 'periodic-execution',
    }
  }

  if (
    normalizedPathname === 'options.html' ||
    normalizedPathname === 'options'
  ) {
    return {
      expandedGroup: 'tab-list',
      item: 'options',
    }
  }

  return {
    expandedGroup: 'tab-list',
    item:
      getSavedTabsModeFromLocation(search) === 'custom'
        ? 'saved-tabs-custom'
        : 'saved-tabs-domain',
  }
}

const getAppRoute = (item: SidebarItemId): string => {
  switch (item) {
    case 'ai-chat': {
      return '/ai-chat'
    }
    case 'analytics': {
      return '/analytics'
    }
    case 'options': {
      return '/options'
    }
    case 'periodic-execution': {
      return '/periodic-execution'
    }
    case 'saved-tabs-custom': {
      return '/saved-tabs?mode=custom'
    }
    case 'saved-tabs-domain': {
      return '/saved-tabs?mode=domain'
    }
  }
}

const getAppEntryHref = (route: string): string => `${APP_ENTRY_PATH}#${route}`

const getPageHref = (item: SidebarItemId): string => {
  switch (item) {
    case 'ai-chat': {
      return 'ai-chat.html'
    }
    case 'analytics': {
      return 'analytics.html'
    }
    case 'options': {
      return 'options.html'
    }
    case 'periodic-execution': {
      return 'periodic-execution.html'
    }
    case 'saved-tabs-custom': {
      return 'saved-tabs.html?mode=custom'
    }
    case 'saved-tabs-domain': {
      return 'saved-tabs.html?mode=domain'
    }
  }
}

const getSavedTabsEntryRoute = (): string => '/saved-tabs'

const getSavedTabsHrefForMode = (mode: ViewMode): string =>
  getAppRoute(mode === 'custom' ? 'saved-tabs-custom' : 'saved-tabs-domain')

const getLegacyRedirectHref = (pathname: string, search: string): string => {
  const normalizedPathname = getNormalizedPathname(pathname)

  if (normalizedPathname === 'ai-chat.html') {
    return getAppEntryHref(getAppRoute('ai-chat'))
  }

  if (normalizedPathname === 'analytics.html') {
    return getAppEntryHref(getAppRoute('analytics'))
  }

  if (normalizedPathname === 'options.html') {
    return getAppEntryHref(getAppRoute('options'))
  }

  if (normalizedPathname === 'periodic-execution.html') {
    return getAppEntryHref(getAppRoute('periodic-execution'))
  }

  const params = new URLSearchParams(search)

  if (!params.has('mode')) {
    return getAppEntryHref(getSavedTabsEntryRoute())
  }

  const mode = getSavedTabsModeFromLocation(search)
  return getAppEntryHref(getSavedTabsHrefForMode(mode))
}

export type { SidebarItemId, SidebarState }
export {
  APP_ENTRY_PATH,
  getAppEntryHref,
  getAppRoute,
  getLegacyRedirectHref,
  getPageHref,
  getSavedTabsEntryRoute,
  getSavedTabsHrefForMode,
  getSavedTabsModeFromLocation,
  getSidebarStateFromLocation,
}
