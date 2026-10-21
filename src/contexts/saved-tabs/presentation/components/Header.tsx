import { Plus, X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import type { AssignDomainToCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/AssignDomainToCategoryUseCase'
import type { CreateParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateParentCategoryUseCase'
import type { DeleteParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteParentCategoryUseCase'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { CategoryModal } from './CategoryModal'
import { HeaderCounts } from './HeaderCounts'
import { NewProjectDialog } from './NewProjectDialog'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './shared/SavedTabsResponsive'
import { UrlOpeningResult } from './UrlOpeningResult'
import { ViewModeToggle } from './ViewModeToggle'

const EMPTY_CUSTOM_PROJECTS: CustomProject[] = []
const noopCreateProject = () => {}

type HeaderProps = {
  openingOperation?: ComponentProps<typeof UrlOpeningResult>['operation']
  onRetryOpening?: () => Promise<void>
  onCancelOpening?: () => void
  onResumeOpening?: () => Promise<void>
  tabGroups: TabGroup[]
  filteredTabGroups?: TabGroup[]
  currentMode: ViewMode
  onModeChange: (mode: ViewMode) => void
  searchQuery: string
  onSearchChange: (query: string) => void
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

export const Header = ({
  // eslint-disable-line eslint/max-lines-per-function
  openingOperation,
  onRetryOpening,
  onCancelOpening,
  onResumeOpening,
  tabGroups,
  filteredTabGroups,
  currentMode,
  onModeChange,
  searchQuery,
  onSearchChange,
  customProjects = EMPTY_CUSTOM_PROJECTS,
  filteredCustomProjects,
  onCreateProject = noopCreateProject,
  getSavedTabsPageDataQuery,
  createParentCategoryUseCase,
  deleteParentCategoryUseCase,
  assignDomainToCategoryUseCase,
}: HeaderProps) => {
  const { t } = useI18n()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCustomProjectModalOpen, setIsCustomProjectModalOpen] =
    useState(false)

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value)
    },
    [onSearchChange],
  )

  const handleSearchClear = useCallback(() => {
    onSearchChange('')
  }, [onSearchChange])

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
        <div className='relative w-full min-w-24'>
          <Input
            type='text'
            aria-label={t('savedTabs.searchPlaceholder')}
            placeholder={t('savedTabs.searchPlaceholder')}
            value={searchQuery}
            onChange={handleSearchChange}
            className='h-9 w-full pr-9'
          />
          {searchQuery && (
            <Button
              type='button'
              variant='ghost'
              aria-label={t('savedTabs.searchClear')}
              title={t('savedTabs.searchClear')}
              onClick={handleSearchClear}
              className='absolute top-1/2 right-0 mr-0.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center'
            >
              <X size={16} />
            </Button>
          )}
        </div>
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
      {onRetryOpening && (
        <UrlOpeningResult
          operation={openingOperation ?? null}
          onRetry={onRetryOpening}
          onCancel={onCancelOpening}
          onResume={onResumeOpening}
        />
      )}
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
