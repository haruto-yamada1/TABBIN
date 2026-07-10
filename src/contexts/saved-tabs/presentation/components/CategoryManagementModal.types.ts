import type { CategoryAssignmentPort } from '@/contexts/saved-tabs/application/ports/CategoryAssignmentPort'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import type { AddDomainToParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/AddDomainToParentCategoryUseCase'
import type { DeleteParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteParentCategoryUseCase'
import type { RemoveDomainFromParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RemoveDomainFromParentCategoryUseCase'
import type { RenameParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RenameParentCategoryUseCase'

export type CategoryManagementModalDeps = {
  readonly categoryAssignmentPort: CategoryAssignmentPort
  readonly getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
}

export type CategoryManagementModalUseCases = {
  readonly renameParentCategory: RenameParentCategoryUseCase
  readonly addDomainToParentCategory: AddDomainToParentCategoryUseCase
  readonly removeDomainFromParentCategory: RemoveDomainFromParentCategoryUseCase
  readonly deleteParentCategory: DeleteParentCategoryUseCase
}
