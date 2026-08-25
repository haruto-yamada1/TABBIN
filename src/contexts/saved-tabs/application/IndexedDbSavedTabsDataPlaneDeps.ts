import type { UserSettingsRepository } from '@/contexts/saved-tabs/domain/repositories/UserSettingsRepository'

import type { BrowserTabPort } from './ports/BrowserTabPort'
import type { BrowserWindowPort } from './ports/BrowserWindowPort'
import type { ClockPort } from './ports/ClockPort'
import type { IdGeneratorPort } from './ports/IdGeneratorPort'
import type { MessagingPort } from './ports/MessagingPort'
import type { NotificationPort } from './ports/NotificationPort'
import type { PersistenceV2QueryPort } from './ports/PersistenceV2QueryPort'
import type { PersistenceV2UnitOfWorkPort } from './ports/PersistenceV2UnitOfWorkPort'
import type { StorageChangePort } from './ports/StorageChangePort'

/**
 * Required dependencies for the native IndexedDB saved-tabs data plane.
 *
 * Keeping this contract separate from `SavedTabsUseCasesDeps` makes the
 * selected backend explicit. A missing native port is therefore a composition
 * error and can never silently select the legacy repositories.
 */
export type IndexedDbSavedTabsDataPlaneDeps = {
  readonly browserTabPort: BrowserTabPort
  readonly browserWindowPort: BrowserWindowPort
  readonly clock: ClockPort
  readonly idGenerator: IdGeneratorPort
  readonly messagingPort: MessagingPort
  readonly notificationPort: NotificationPort
  readonly queryPort: PersistenceV2QueryPort
  readonly storageChangePort: StorageChangePort
  readonly unitOfWorkPort: PersistenceV2UnitOfWorkPort
  readonly userSettingsRepository: UserSettingsRepository
}
