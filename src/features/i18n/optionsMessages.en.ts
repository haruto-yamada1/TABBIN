import { linkCaptureMessagesEn } from './linkCaptureMessages.en'
import { reviewReminderMessagesEn } from './reviewReminderMessages.en'

const optionsMessagesEn = {
  ...linkCaptureMessagesEn,
  ...reviewReminderMessagesEn,
  'background.saveTabs.filterErrorTitle': 'Tabs were not saved',
  'background.saveTabs.filterErrorMessage':
    'Could not check which tabs to save. No tabs were saved or closed. Check pinned-tab and exclusion settings in Options, then try again.',
  'background.saveTabs.captureErrorTitle': 'Could not complete saving tabs',
  'background.saveTabs.captureErrorMessage':
    'Tabs have been kept open. Check your saved tabs, then try saving again.',
  'background.settings.readErrorTitle': 'Settings could not be verified',
  'background.settings.readErrorMessage':
    'The operation was stopped to protect your data. Reload or recover your settings in Options, then try again.',
  'options.settingsRead.title': 'Settings could not be loaded',
  'options.settingsRead.unavailable':
    'Settings could not be read. Editing is paused to protect your saved preferences. Try loading them again.',
  'options.settingsRead.invalid':
    'Some saved settings are invalid. Try loading them again, or reset settings to defaults. Resetting replaces your preferences; saved tabs and categories are kept.',
  'options.settingsRead.retry': 'Retry loading settings',
  'options.settingsRead.reset': 'Reset settings to defaults',
  'background.saveTabs.titleCaptureErrorTitle': 'Tabs were not saved',
  'background.saveTabs.titleCaptureErrorMessage':
    'Could not confirm a tab title. No tabs were saved or closed by TABBIN. Retry saving the tab.',
  'options.keyboardShortcuts.title': 'Keyboard shortcuts',
  'options.keyboardShortcuts.description':
    'Shortcuts available on the saved tabs page. They do not run while you are typing in a text field.',
  'options.keyboardShortcuts.toggleSidebar': 'Toggle sidebar',
  'options.savedTabTitle.title': 'Saved marks on browser tabs',
  'options.savedTabTitle.enable': 'Show ✓ in saved tab titles',
  'options.savedTabTitle.description':
    'Adds ✓ before the title of saved HTTP and HTTPS tabs. Enabling asks for optional site access. Restricted browser pages are excluded. Websites can see title changes. This preference stays on this device and is not included in backups.',
  'options.savedTabTitle.permissionError':
    'Site access was not granted. Turn this on again and allow the requested access to show saved marks.',
  'options.savedTabTitle.storageError':
    'Could not save the setting. Reload the settings page and try again.',
  'options.savedTabTitle.loadError':
    'Could not check the setting or site access. Reload the settings page and try again.',
  'periodicExecution.recovery.title': 'Recover expired tabs',
  'periodicExecution.recovery.description':
    'Tabs removed after expiring can be restored for {{days}} days. Recovery is stored on this device.',
  'periodicExecution.recovery.empty': 'No expired tabs to restore.',
  'periodicExecution.recovery.single': '1 saved tab available to restore',
  'periodicExecution.recovery.count':
    '{{count}} saved tabs available to restore',
  'periodicExecution.recovery.removedOn': 'Removed on',
  'periodicExecution.recovery.restoreBy': 'Restore by',
  'periodicExecution.recovery.originalLocations': 'Original locations',
  'periodicExecution.recovery.categoryPath':
    '{{collectionName}} / {{categoryName}}',
  'periodicExecution.recovery.noLocation': 'No original collection',
  'periodicExecution.recovery.restore': 'Restore',
  'periodicExecution.recovery.restoreTab': 'Restore {{name}}',
  'periodicExecution.recovery.restoreCompleted':
    'Finished restoring saved tabs',
  'periodicExecution.recovery.restoreAll': 'Restore all',
  'periodicExecution.recovery.discard': 'Permanently delete',
  'periodicExecution.recovery.discardTab': 'Permanently delete {{name}}',
  'periodicExecution.recovery.discardTitle': 'Permanently delete this tab?',
  'periodicExecution.recovery.discardDescription':
    '“{{name}}” will be removed from recovery and cannot be restored here.',
  'periodicExecution.recovery.loadError': 'Could not load expired tabs.',
  'periodicExecution.recovery.retry': 'Retry loading expired tabs',
  'periodicExecution.recovery.error':
    'Could not update expired tabs. Try again.',
  'periodicExecution.recovery.pending': 'Updating expired tabs…',
  'periodicExecution.recovery.unavailable':
    'The selected tabs are no longer available in recovery.',
  'periodicExecution.recovery.restored': 'Restored ({{count}}).',
  'periodicExecution.recovery.discarded': 'Permanently deleted ({{count}}).',
  'periodicExecution.recovery.showMore': 'Show more expired tabs',
} as const

export { optionsMessagesEn }
