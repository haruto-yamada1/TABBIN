import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import type { DomainCategorySettingsRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategorySettingsRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import type { UserSettingsRepository } from '@/contexts/saved-tabs/domain/repositories/UserSettingsRepository'

import type { BrowserTabPort } from './ports/BrowserTabPort'
import type { BrowserWindowPort } from './ports/BrowserWindowPort'
import type { CategoriesCommandService } from './ports/CategoriesCommandService'
import type { CategoryAssignmentPort } from './ports/CategoryAssignmentPort'
import type { ClockPort } from './ports/ClockPort'
import type { CustomProjectsCommandService } from './ports/CustomProjectsCommandService'
import type { IdGeneratorPort } from './ports/IdGeneratorPort'
import type { MessagingPort } from './ports/MessagingPort'
import type { MigrationPort } from './ports/MigrationPort'
import type { NotificationPort } from './ports/NotificationPort'
import type { RemoveSubCategoryFromTabGroupPort } from './ports/RemoveSubCategoryFromTabGroupPort'
import type { SavedTabsTabGroupReadPort } from './ports/SavedTabsTabGroupReadPort'
import type { SetCategoryKeywordsPort } from './ports/SetCategoryKeywordsPort'
import type { StorageChangePort } from './ports/StorageChangePort'

/** Dependencies required to construct and present the saved-tabs use cases. */
export type SavedTabsUseCasesDeps = {
  readonly browserTabPort: BrowserTabPort
  readonly browserWindowPort: BrowserWindowPort
  readonly categoriesCommandService: CategoriesCommandService
  readonly categoryAssignmentPort: CategoryAssignmentPort
  readonly clock: ClockPort
  readonly customProjectRepository: CustomProjectRepository
  readonly idGenerator: IdGeneratorPort
  readonly customProjectsCommandService: CustomProjectsCommandService
  readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
  readonly domainCategorySettingsRepository: DomainCategorySettingsRepository
  readonly messagingPort: MessagingPort
  readonly migrationPort: MigrationPort
  readonly notificationPort: NotificationPort
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly removeSubCategoryFromTabGroupPort: RemoveSubCategoryFromTabGroupPort
  readonly setCategoryKeywordsPort: SetCategoryKeywordsPort
  readonly storageChangePort: StorageChangePort
  readonly savedTabsTabGroupReadPort?: SavedTabsTabGroupReadPort
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly userSettingsRepository: UserSettingsRepository
}
