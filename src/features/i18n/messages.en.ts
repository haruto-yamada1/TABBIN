import { aiChatComposerMessagesEn } from './aiChatComposerMessages.en'
import { aiChatTrustMessagesEn } from './aiChatTrustMessages.en'
import { analyticsHealthMessagesEn } from './analyticsHealthMessages.en'
import { backgroundContextMenuMessagesEn } from './backgroundContextMenuMessages.en'
import { backupExportMessagesEn } from './backupExportMessages.en'
import { backupImportMessagesEn } from './backupImportMessages.en'
import { coreMessagesEn } from './coreMessages.en'
import { dndMessagesEn } from './dndMessages.en'
import { favoriteMessagesEn } from './favoriteMessages.en'
import { navigationMessagesEn } from './navigationMessages.en'
import { optionsMessagesEn } from './optionsMessages.en'
import { organizationActionMessagesEn } from './organizationActionMessages.en'
import { savedTabsUndoMessagesEn } from './savedTabsUndoMessages.en'
import { searchHistoryMessagesEn } from './searchHistoryMessages.en'
import { selectionMessagesEn } from './selectionMessages.en'
import { tabOpeningErrorMessagesEn } from './tabOpeningErrorMessages.en'

const messagesEn = {
  ...aiChatTrustMessagesEn,
  ...aiChatComposerMessagesEn,
  ...navigationMessagesEn,
  ...backupExportMessagesEn,
  ...backupImportMessagesEn,
  ...dndMessagesEn,
  ...analyticsHealthMessagesEn,
  ...organizationActionMessagesEn,
  ...selectionMessagesEn,
  ...searchHistoryMessagesEn,
  ...optionsMessagesEn,
  ...savedTabsUndoMessagesEn,
  ...favoriteMessagesEn,
  ...tabOpeningErrorMessagesEn,
  ...backgroundContextMenuMessagesEn,
  ...coreMessagesEn,
} as const

export { messagesEn }
