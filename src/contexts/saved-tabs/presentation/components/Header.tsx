import { Plus, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

// eslint-disable-next-line eslint/complexity
export const Header = ({
  // eslint-disable-line eslint/max-lines-per-function
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
  const [newProjectName, setNewProjectName] = useState('')
  const normalizedSearchQuery = searchQuery.trim()
  const groupsForDisplay = filteredTabGroups ?? tabGroups
  const customGroupsForDisplay = filteredCustomProjects ?? customProjects
  const handleNewProjectNameInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      if (node && isCustomProjectModalOpen) {
        node.focus()
      }
    },
    [isCustomProjectModalOpen],
  )
  const domainTabCount = groupsForDisplay.reduce((sum, group) => {
    if (group.urls) {
      return sum + group.urls.length
    }
    if (group.memberships) {
      return sum + group.memberships.length
    }
    return sum
  }, 0)

  const customTabCount = customGroupsForDisplay.reduce((sum, project) => {
    if (normalizedSearchQuery.length === 0 && project.memberships) {
      return sum + project.memberships.length
    }
    if (project.urls) {
      return sum + project.urls.length
    }
    if (project.memberships) {
      return sum + project.memberships.length
    }
    return sum
  }, 0)

  const tabCount = currentMode === 'custom' ? customTabCount : domainTabCount

  const handleCustomProjectEnter = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return
      }

      const isComposing =
        event.nativeEvent.isComposing ||
        ('isComposing' in event &&
          Boolean(Reflect.get(event, 'isComposing'))) ||
        false
      if (isComposing) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const name = newProjectName.trim()
      if (!name) {
        toast.error(t('savedTabs.projectNameRequired'))
        return
      }

      const exists = customProjects.some(
        (project) => project.name.toLowerCase() === name.toLowerCase(),
      )
      if (exists) {
        toast.error(t('savedTabs.projectNameDuplicate'))
        return
      }

      onCreateProject(name)
      toast.success(t('savedTabs.projectAdded', undefined, { name }))
      setNewProjectName('')
      setIsCustomProjectModalOpen(false)
    },
    [newProjectName, customProjects, onCreateProject, t],
  )

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

  const handleNewProjectNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewProjectName(e.target.value)
    },
    [],
  )

  return (
    <div className='mb-4 flex items-center gap-4'>
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
        <div className='space-x-4 text-sm text-muted-foreground'>
          <p>
            {t('savedTabs.tabCount', undefined, { count: String(tabCount) })}
          </p>
          {currentMode === 'custom' ? (
            <p>
              {t('savedTabs.projectsCount', undefined, {
                count: String(customGroupsForDisplay.length),
              })}
            </p>
          ) : (
            <p>
              {t('savedTabs.domainsCount', undefined, {
                count: String(groupsForDisplay.length),
              })}
            </p>
          )}
        </div>
      </div>

      {currentMode === 'domain' && isModalOpen && (
        <CategoryModal
          onClose={handleCloseModal}
          tabGroups={tabGroups}
          assignDomainToCategoryUseCase={assignDomainToCategoryUseCase}
          createParentCategoryUseCase={createParentCategoryUseCase}
          deleteParentCategoryUseCase={deleteParentCategoryUseCase}
          getSavedTabsPageDataQuery={getSavedTabsPageDataQuery}
        />
      )}
      {currentMode === 'custom' && isCustomProjectModalOpen && (
        <Dialog
          open={isCustomProjectModalOpen}
          onOpenChange={setIsCustomProjectModalOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('savedTabs.newProjectTitle')}</DialogTitle>
            </DialogHeader>
            <Input
              ref={handleNewProjectNameInputRef}
              value={newProjectName}
              onChange={handleNewProjectNameChange}
              onKeyDown={handleCustomProjectEnter}
              placeholder={t('savedTabs.newProjectPlaceholder')}
              className='mb-2 w-full'
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
