import type { BrowserTabPort } from './BrowserTabPort'
import type { CategoryAssignmentPort } from './CategoryAssignmentPort'
import type { MessagingPort } from './MessagingPort'
import type { OpenSavedTabsPort } from './OpenSavedTabsPort'
import type { SavedTabsSortPreferencesPort } from './SavedTabsSortPreferencesPort'
import type { StorageChangePort } from './StorageChangePort'

/** Non-persistence ports that the saved-tabs presentation layer may invoke. */
export type SavedTabsPresentationPorts = {
  readonly openSavedTabsPort?: OpenSavedTabsPort
  readonly sortPreferencesPort?: SavedTabsSortPreferencesPort
  readonly browserTabPort: BrowserTabPort
  readonly categoryAssignmentPort: CategoryAssignmentPort
  readonly messagingPort: MessagingPort
  readonly storageChangePort: StorageChangePort
}
