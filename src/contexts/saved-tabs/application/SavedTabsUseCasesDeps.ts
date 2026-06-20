import type { CustomProjectRepository } from '../domain/repositories/CustomProjectRepository'
import type { DomainCategoryMappingRepository } from '../domain/repositories/DomainCategoryMappingRepository'
import type { DomainCategorySettingsRepository } from '../domain/repositories/DomainCategorySettingsRepository'
import type { ParentCategoryRepository } from '../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../domain/repositories/UrlRecordRepository'
import type { UserSettingsRepository } from '../domain/repositories/UserSettingsRepository'
import type { BrowserTabPort } from './ports/BrowserTabPort'
import type { BrowserWindowPort } from './ports/BrowserWindowPort'
import type { CategoriesCommandService } from './ports/CategoriesCommandService'
import type { CategoryAssignmentPort } from './ports/CategoryAssignmentPort'
import type { CustomProjectsCommandService } from './ports/CustomProjectsCommandService'
import type { MessagingPort } from './ports/MessagingPort'
import type { MigrationPort } from './ports/MigrationPort'
import type { NotificationPort } from './ports/NotificationPort'
import type { RemoveSubCategoryFromTabGroupPort } from './ports/RemoveSubCategoryFromTabGroupPort'
import type { SetCategoryKeywordsPort } from './ports/SetCategoryKeywordsPort'
import type { StorageChangePort } from './ports/StorageChangePort'

/** Dependencies required to construct and present the saved-tabs use cases. */
export interface SavedTabsUseCasesDeps {
  readonly browserTabPort: BrowserTabPort
  readonly browserWindowPort: BrowserWindowPort
  readonly categoriesCommandService: CategoriesCommandService
  readonly categoryAssignmentPort: CategoryAssignmentPort
  readonly customProjectRepository: CustomProjectRepository
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
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly userSettingsRepository: UserSettingsRepository
}
