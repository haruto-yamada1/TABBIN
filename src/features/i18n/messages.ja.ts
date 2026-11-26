import { aiChatComposerMessagesJa } from './aiChatComposerMessages.ja'
import { aiChatTrustMessagesJa } from './aiChatTrustMessages.ja'
import { analyticsHealthMessagesJa } from './analyticsHealthMessages.ja'
import { backgroundContextMenuMessagesJa } from './backgroundContextMenuMessages.ja'
import { backupExportMessagesJa } from './backupExportMessages.ja'
import { backupImportMessagesJa } from './backupImportMessages.ja'
import { coreMessagesJa } from './coreMessages.ja'
import { dndMessagesJa } from './dndMessages.ja'
import { favoriteMessagesJa } from './favoriteMessages.ja'
import { navigationMessagesJa } from './navigationMessages.ja'
import { optionsMessagesJa } from './optionsMessages.ja'
import { organizationActionMessagesJa } from './organizationActionMessages.ja'
import { searchHistoryMessagesJa } from './searchHistoryMessages.ja'
import { selectionMessagesJa } from './selectionMessages.ja'
import { tabOpeningErrorMessagesJa } from './tabOpeningErrorMessages.ja'

const messagesJa = {
  ...aiChatTrustMessagesJa,
  ...aiChatComposerMessagesJa,
  ...navigationMessagesJa,
  ...backupExportMessagesJa,
  ...backupImportMessagesJa,
  ...dndMessagesJa,
  ...analyticsHealthMessagesJa,
  ...organizationActionMessagesJa,
  ...selectionMessagesJa,
  ...searchHistoryMessagesJa,
  ...optionsMessagesJa,
  ...favoriteMessagesJa,
  ...tabOpeningErrorMessagesJa,
  ...backgroundContextMenuMessagesJa,
  ...coreMessagesJa,
} as const

export { messagesJa }
