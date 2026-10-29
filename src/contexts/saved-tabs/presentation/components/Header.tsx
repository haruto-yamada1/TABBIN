import { Plus } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import type { SavedTabsSearchHistoryPort } from '@/contexts/saved-tabs/application/ports/SavedTabsSearchHistoryPort'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import type { AssignDomainToCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/AssignDomainToCategoryUseCase'
import type { CreateParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateParentCategoryUseCase'
import type { DeleteParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteParentCategoryUseCase'
import { useSearchHistory } from '@/contexts/saved-tabs/presentation/hooks/useSearchHistory'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { OnboardingGuide } from '@/features/onboarding/OnboardingGuide'

import { CategoryModal } from './CategoryModal'
import { HeaderCounts } from './HeaderCounts'
import { NewProjectDialog } from './NewProjectDialog'
import { SearchHistoryInput } from './SearchHistoryInput'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './shared/SavedTabsResponsive'
import { ViewModeToggle } from './ViewModeToggle'

const EMPTY_CUSTOM_PROJECTS: CustomProject[] = []
const noopCreateProject = () => {}

type HeaderProps = {
  tabGroups: TabGroup[]
  filteredTabGroups?: TabGroup[]
  currentMode: ViewMode
  onModeChange: (mode: ViewMode) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  searchHistoryPort?: SavedTabsSearchHistoryPort | undefined
  onOpenFilter?: () => void
  customProjects?: CustomProject[]
  filteredCustomProjects?: CustomProject[]
  onCreateProject?: (name: string) => void
  /**
   * `CategoryModal` 配下の `useCategoryModal` が
   * `lib/storage/categories` / `lib/storage/migration` の直叩きを
   * 避けるために必要とする依存 (issue #509)。
   * issue #510 で `parentCategoryRepository` は page data query に
   * 統合されたため、query 1 つへ集約。
   */
  getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
  createParentCategoryUseCase?: CreateParentCategoryUseCase
  deleteParentCategoryUseCase?: DeleteParentCategoryUseCase
  assignDomainToCategoryUseCase?: AssignDomainToCategoryUseCase
}

const HeaderToolbar = ({
  // eslint-disable-line eslint/max-lines-per-function
  tabGroups,
  filteredTabGroups,
  currentMode,
  onModeChange,
  searchQuery,
  onSearchChange,
  searchHistoryPort,
  customProjects = EMPTY_CUSTOM_PROJECTS,
  filteredCustomProjects,
  onCreateProject = noopCreateProject,
  getSavedTabsPageDataQuery,
  createParentCategoryUseCase,
  deleteParentCategoryUseCase,
  assignDomainToCategoryUseCase,
}: HeaderProps) => {
  const { t } = useI18n()
  const [isComposing, setIsComposing] = useState(false)
  const history = useSearchHistory(searchHistoryPort, searchQuery, isComposing)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCustomProjectModalOpen, setIsCustomProjectModalOpen] =
    useState(false)

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const handleOpenCustomProjectModal = useCallback(() => {
    setIsCustomProjectModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
  }, [])

  return (
    <div className='mb-4 flex flex-wrap items-center gap-4'>
      <div className='flex flex-1 items-center gap-1'>
        <SearchHistoryInput
          query={searchQuery}
          entries={history.entries}
          historyError={history.error}
          onQueryChange={onSearchChange}
          onRemove={history.handleRemove}
          onCompositionChange={setIsComposing}
        />
      </div>
      <div className='flex shrink-0 items-center gap-1 whitespace-nowrap'>
        {currentMode === 'domain' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                onClick={handleOpenModal}
                className='flex h-9 cursor-pointer items-center gap-2'
              >
                <Plus size={16} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.manageParentCategories')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {t('savedTabs.manageParentCategories')}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
        )}
        {currentMode === 'custom' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                onClick={handleOpenCustomProjectModal}
                className='flex h-9 cursor-pointer items-center gap-2'
              >
                <Plus size={16} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.addProject')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {t('savedTabs.addProject')}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
        )}
        <ViewModeToggle currentMode={currentMode} onChange={onModeChange} />
        <HeaderCounts
          currentMode={currentMode}
          searchQuery={searchQuery}
          tabGroups={tabGroups}
          filteredTabGroups={filteredTabGroups}
          customProjects={customProjects}
          filteredCustomProjects={filteredCustomProjects}
        />
      </div>
      {currentMode === 'domain' && isModalOpen && (
        <CategoryModal
          onClose={handleCloseModal}
          tabGroups={tabGroups}
          {...(assignDomainToCategoryUseCase !== undefined
            ? { assignDomainToCategoryUseCase }
            : {})}
          {...(createParentCategoryUseCase !== undefined
            ? { createParentCategoryUseCase }
            : {})}
          {...(deleteParentCategoryUseCase !== undefined
            ? { deleteParentCategoryUseCase }
            : {})}
          getSavedTabsPageDataQuery={getSavedTabsPageDataQuery}
        />
      )}
      <NewProjectDialog
        open={currentMode === 'custom' && isCustomProjectModalOpen}
        onOpenChange={setIsCustomProjectModalOpen}
        customProjects={customProjects}
        onCreateProject={onCreateProject}
      />
    </div>
  )
}

export const Header = (props: HeaderProps) => (
  <>
    <HeaderToolbar {...props} />
    <OnboardingGuide automatic />
  </>
)
