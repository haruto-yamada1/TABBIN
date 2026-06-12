import type { SidebarState } from '@/features/navigation/lib/pageNavigation'
import type { OllamaErrorDetails } from '@/types/background'

export const storybookThemeStorage = (theme: 'dark' | 'light' | 'user') => ({
  'tab-manager-theme': theme,
  userSettings: {
    colors: {
      background: '#111827',
      foreground: '#f8fafc',
      primary: '#0f172a',
      'primary-foreground': '#f8fafc',
    },
  },
})

export const savedTabsSidebarState: SidebarState = {
  expandedGroup: 'tab-list',
  item: 'saved-tabs-domain',
}

export const analyticsSidebarState: SidebarState = {
  expandedGroup: 'tab-list',
  item: 'analytics',
}

export const ollamaForbiddenError: OllamaErrorDetails = {
  allowedOrigins: 'chrome-extension://*',
  baseUrl: 'http://127.0.0.1:11434',
  downloadUrl: 'https://ollama.com/download',
  faqUrl: 'https://ollama.com/faq',
  kind: 'forbidden',
  tagsUrl: 'http://127.0.0.1:11434/api/tags',
}

export const ollamaConnectionError: OllamaErrorDetails = {
  ...ollamaForbiddenError,
  kind: 'notInstalledOrNotRunning',
}
