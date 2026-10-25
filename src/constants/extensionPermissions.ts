import { SAVED_TAB_TITLE_ORIGINS } from './savedTabTitleIndicator.ts'

export const PRODUCTION_EXTENSION_PERMISSIONS = [
  'alarms',
  'tabs',
  'storage',
  'contextMenus',
  'notifications',
  'unlimitedStorage',
] as const
export const PRODUCTION_OPTIONAL_EXTENSION_PERMISSIONS = ['scripting'] as const
export const PRODUCTION_OPTIONAL_HOST_PERMISSIONS = SAVED_TAB_TITLE_ORIGINS
