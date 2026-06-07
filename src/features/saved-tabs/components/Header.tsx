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
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { CustomProject, TabGroup, ViewMode } from '@/types/storage'

import { CategoryModal } from './CategoryModal'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './shared/SavedTabsResponsive'
import { ViewModeToggle } from './ViewModeToggle'

const EMPTY_CUSTOM_PROJECTS: CustomProject[] = []
const noopCreateProject = () => {}

interface HeaderProps {
  tabGroups: TabGroup[]
  filteredTabGroups?: TabGroup[]
  currentMode: ViewMode
  onModeChange: (mode: ViewMode) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onOpenFilter?: () => void
  customProjects: CustomProject[]
  filteredCustomProjects?: CustomProject[]
  onCreateProject: (name: string) => void
}

// eslint-disable-next-line eslint/complexity
export const Header = ({
  tabGroups,
  filteredTabGroups,
  currentMode,
  onModeChange,
  searchQuery,
  onSearchChange,
  // eslint-disable-next-line typescript/no-useless-default-assignment
  customProjects = EMPTY_CUSTOM_PROJECTS,
  filteredCustomProjects,
  // eslint-disable-next-line typescript/no-useless-default-assignment
  onCreateProject = noopCreateProject,
}: HeaderProps) => {
  const { t } = useI18n()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCustomProjectModalOpen, setIsCustomProjectModalOpen] =
    useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const normalizedSearchQuery = searchQuery.trim()
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  const groupsForDisplay = filteredTabGroups || tabGroups
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  const customGroupsForDisplay = filteredCustomProjects || customProjects
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
    if (group.urlIds) {
      return sum + group.urlIds.length
    }
    return sum
  }, 0)

  const customTabCount = customGroupsForDisplay.reduce((sum, project) => {
    if (normalizedSearchQuery.length === 0 && project.urlIds) {
      return sum + project.urlIds.length
    }
    if (project.urls) {
      return sum + project.urls.length
    }
    if (project.urlIds) {
      return sum + project.urlIds.length
    }
    return sum
  }, 0)

  const tabCount = currentMode === 'custom' ? customTabCount : domainTabCount

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleCustomProjectEnter = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== 'Enter') {
      return
    }

    const isComposing =
      event.nativeEvent.isComposing ||
      // eslint-disable-next-line typescript/prefer-nullish-coalescing
      (event as unknown as { isComposing?: boolean }).isComposing || // eslint-disable-line typescript/no-unsafe-type-assertion
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
  }

  return (
    <div className='mb-4 flex items-center gap-4'>
      <div className='flex flex-1 items-center gap-1'>
        <div className='relative w-full min-w-24'>
          <Input
            type='text'
            aria-label={t('savedTabs.searchPlaceholder')}
            placeholder={t('savedTabs.searchPlaceholder')}
            value={searchQuery}
            // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
            onChange={(e) => {
              onSearchChange(e.target.value)
            }}
            className='h-9 w-full pr-9'
          />
          {searchQuery && (
            <Button
              type='button'
              variant='ghost'
              aria-label={t('savedTabs.searchClear')}
              title={t('savedTabs.searchClear')}
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={() => {
                onSearchChange('')
              }}
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                onClick={() => {
                  setIsModalOpen(true)
                }}
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                onClick={() => {
                  setIsCustomProjectModalOpen(true)
                }}
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
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onClose={() => {
            setIsModalOpen(false)
          }}
          tabGroups={tabGroups}
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
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onChange={(e) => {
                setNewProjectName(e.target.value)
              }}
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
