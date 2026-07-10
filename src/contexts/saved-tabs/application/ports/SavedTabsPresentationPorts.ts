import type { BrowserTabPort } from './BrowserTabPort'
import type { CategoryAssignmentPort } from './CategoryAssignmentPort'
import type { MessagingPort } from './MessagingPort'
import type { MigrationPort } from './MigrationPort'
import type { StorageChangePort } from './StorageChangePort'

/** Non-persistence ports that the saved-tabs presentation layer may invoke. */
export type SavedTabsPresentationPorts = {
  readonly browserTabPort: BrowserTabPort
  readonly categoryAssignmentPort: CategoryAssignmentPort
  readonly messagingPort: MessagingPort
  readonly migrationPort: MigrationPort
  readonly storageChangePort: StorageChangePort
}
