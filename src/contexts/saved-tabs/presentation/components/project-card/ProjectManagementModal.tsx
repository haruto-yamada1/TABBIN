import { Edit, Trash2, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { savedTabsUncategorizedProjectId as UNCATEGORIZED_PROJECT_ID } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsProjectKeywordSettingsDto as ProjectKeywordSettings,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { DeleteEntityConfirmPanel } from '@/contexts/saved-tabs/presentation/components/shared/DeleteEntityConfirmPanel'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/contexts/saved-tabs/presentation/components/shared/SavedTabsResponsive'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useProjectModalState } from './useProjectModalState'
import { createProjectNameSchema } from './useProjectNameSchema'

interface ProjectManagementModalProps {
  isOpen: boolean
  onClose: () => void
  project: CustomProject
  onRenameProject?: (projectId: string, newName: string) => Promise<void> | void
  onUpdateProjectKeywords?: (
    projectId: string,
    projectKeywords: ProjectKeywordSettings,
  ) => Promise<void> | void
  onDeleteProject?: (projectId: string) => Promise<void> | void
}

interface ProjectKeywordSectionProps {
  label: string
  description: string
  inputId: string
  placeholder: string
  keywords: string[]
  newKeyword: string
  disabled: boolean
  onKeywordChange: (value: string) => void
  onAddKeyword: () => void
  onBlurKeyword: () => void
  onRemoveKeyword: (keyword: string) => void
}

const KeywordBadge = ({
  keyword,
  disabled,
  onRemove,
}: {
  keyword: string
  disabled: boolean
  onRemove: (keyword: string) => void
}) => {
  const { t } = useI18n()
  const handleClick = useCallback(() => {
    onRemove(keyword)
  }, [keyword, onRemove])

  return (
    <Badge
      variant='outline'
      className='flex items-center gap-1 rounded px-2 py-1'
      data-testid={`keyword-badge-${keyword}`}
    >
      {keyword}
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={handleClick}
        className='h-5 px-1'
        aria-label={t('savedTabs.keywords.deleteAria')}
        disabled={disabled}
      >
        <X size={14} />
      </Button>
    </Badge>
  )
}

const ProjectKeywordSection = ({
  label,
  description,
  inputId,
  placeholder,
  keywords,
  newKeyword,
  disabled,
  onKeywordChange,
  onAddKeyword,
  onBlurKeyword,
  onRemoveKeyword,
}: ProjectKeywordSectionProps) => {
  const { t } = useI18n()
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onKeywordChange(e.target.value)
    },
    [onKeywordChange],
  )
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onAddKeyword()
      }
    },
    [onAddKeyword],
  )
  const handleBlur = useCallback(() => {
    if (newKeyword.trim()) {
      onBlurKeyword()
    }
  }, [newKeyword, onBlurKeyword])

  return (
    <div className='gap-y-2'>
      <Label htmlFor={inputId}>{label}</Label>
      <p className='text-xs text-muted-foreground'>{description}</p>
      <Input
        id={inputId}
        aria-label={label}
        value={newKeyword}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <div className='flex min-h-12 flex-wrap gap-2 rounded border p-2'>
        {keywords.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('savedTabs.keywords.empty')}
          </p>
        ) : (
          keywords.map((keyword) => (
            <KeywordBadge
              key={keyword}
              keyword={keyword}
              disabled={disabled}
              onRemove={onRemoveKeyword}
            />
          ))
        )}
      </div>
    </div>
  )
}

const ProjectActions = ({
  isRenaming,
  isUncategorizedProject,
  isProcessing,
  handleStartRenaming,
  handleShowDeleteConfirm,
  renameActionLabel,
  deleteActionLabel,
}: {
  isRenaming: boolean
  isUncategorizedProject: boolean
  isProcessing: boolean
  handleStartRenaming: () => void
  handleShowDeleteConfirm: () => void
  renameActionLabel: string
  deleteActionLabel: string
}) => {
  if (isRenaming || isUncategorizedProject) {
    return null
  }

  return (
    <div className='flex items-center gap-2'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleStartRenaming}
            className='flex cursor-pointer items-center gap-2 rounded px-2 py-1'
          >
            <Edit size={14} />
            <SavedTabsResponsiveLabel>
              {renameActionLabel}
            </SavedTabsResponsiveLabel>
          </Button>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          {renameActionLabel}
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='secondary'
            size='sm'
            onClick={handleShowDeleteConfirm}
            className='flex cursor-pointer items-center gap-2 rounded px-2 py-1'
            disabled={isProcessing}
          >
            <Trash2 size={14} />
            <SavedTabsResponsiveLabel>
              {deleteActionLabel}
            </SavedTabsResponsiveLabel>
          </Button>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          {deleteActionLabel}
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>
    </div>
  )
}

const useProjectManagementModalView = ({
  isOpen,
  onClose,
  project,
  onRenameProject,
  onUpdateProjectKeywords,
  onDeleteProject,
}: ProjectManagementModalProps) => {
  const { t } = useI18n()
  const localizedProjectNameSchema = useMemo(
    () =>
      createProjectNameSchema({
        empty: t('savedTabs.projectNameRequired'),
        maxLength: t('savedTabs.projectNameMaxLength'),
      }),
    [t],
  )
  const isUncategorizedProject = project.id === UNCATEGORIZED_PROJECT_ID
  const {
    addKeyword,
    domainKeywords,
    handleCancelRenaming,
    handleDeleteProject,
    handleProjectNameChange,
    handleSaveRenaming,
    handleStartRenaming,
    inputRef,
    isProcessing,
    isRenaming,
    isSaving,
    localProjectName,
    newDomainKeyword,
    newProjectName,
    newTitleKeyword,
    newUrlKeyword,
    projectNameError,
    removeKeyword,
    showDeleteConfirm,
    titleKeywords,
    updateModalState,
    urlKeywords,
  } = useProjectModalState(
    project,
    { onRenameProject, onUpdateProjectKeywords, onDeleteProject, onClose },
    localizedProjectNameSchema,
  )

  const handleOpenChange = useCallback(() => {
    if (isProcessing || isRenaming || isSaving) {
      return
    }
    if (document.readyState === 'loading') {
      return
    }
    onClose()
  }, [isProcessing, isRenaming, isSaving, onClose])

  const handleShowDeleteConfirm = useCallback(() => {
    updateModalState({ showDeleteConfirm: true })
  }, [updateModalState])

  const handleCancelDelete = useCallback(() => {
    updateModalState({ showDeleteConfirm: false })
  }, [updateModalState])

  const handleRenameBlur = useCallback(() => {
    if (isProcessing) {
      return
    }
    const trimmedName = newProjectName.trim()
    if (trimmedName && trimmedName !== localProjectName && !projectNameError) {
      void handleSaveRenaming(trimmedName)
    } else if (projectNameError) {
      inputRef.current?.focus()
    } else {
      handleCancelRenaming()
    }
  }, [
    isProcessing,
    newProjectName,
    localProjectName,
    projectNameError,
    handleSaveRenaming,
    inputRef,
    handleCancelRenaming,
  ])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const trimmedName = newProjectName.trim()
        if (
          trimmedName &&
          trimmedName !== localProjectName &&
          !projectNameError &&
          !isProcessing
        ) {
          void handleSaveRenaming(trimmedName)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancelRenaming()
      }
    },
    [
      newProjectName,
      localProjectName,
      projectNameError,
      isProcessing,
      handleSaveRenaming,
      handleCancelRenaming,
    ],
  )

  const handleNameClick = useCallback(() => {
    if (isUncategorizedProject) {
      return
    }
    handleStartRenaming()
  }, [isUncategorizedProject, handleStartRenaming])

  const handleTitleKeywordChange = useCallback(
    (value: string) => {
      updateModalState({ newTitleKeyword: value })
    },
    [updateModalState],
  )

  const handleTitleAddKeyword = useCallback(() => {
    addKeyword({
      clearInput: () => {
        updateModalState({ newTitleKeyword: '' })
      },
      keyword: newTitleKeyword,
      keywords: titleKeywords,
      section: 'titleKeywords',
      setKeywords: (keywords: string[]) => {
        updateModalState({ titleKeywords: keywords })
      },
    })
  }, [addKeyword, newTitleKeyword, titleKeywords, updateModalState])

  const handleTitleBlurKeyword = useCallback(() => {
    addKeyword({
      clearInput: () => {
        updateModalState({ newTitleKeyword: '' })
      },
      keyword: newTitleKeyword,
      keywords: titleKeywords,
      section: 'titleKeywords',
      setKeywords: (keywords: string[]) => {
        updateModalState({ titleKeywords: keywords })
      },
    })
  }, [addKeyword, newTitleKeyword, titleKeywords, updateModalState])

  const handleTitleRemoveKeyword = useCallback(
    (keyword: string) => {
      removeKeyword(
        keyword,
        'titleKeywords',
        (keywords: string[]) => {
          updateModalState({ titleKeywords: keywords })
        },
        titleKeywords,
      )
    },
    [removeKeyword, titleKeywords, updateModalState],
  )

  const handleUrlKeywordChange = useCallback(
    (value: string) => {
      updateModalState({ newUrlKeyword: value })
    },
    [updateModalState],
  )

  const handleUrlAddKeyword = useCallback(() => {
    addKeyword({
      clearInput: () => {
        updateModalState({ newUrlKeyword: '' })
      },
      keyword: newUrlKeyword,
      keywords: urlKeywords,
      section: 'urlKeywords',
      setKeywords: (keywords: string[]) => {
        updateModalState({ urlKeywords: keywords })
      },
    })
  }, [addKeyword, newUrlKeyword, urlKeywords, updateModalState])

  const handleUrlBlurKeyword = useCallback(() => {
    addKeyword({
      clearInput: () => {
        updateModalState({ newUrlKeyword: '' })
      },
      keyword: newUrlKeyword,
      keywords: urlKeywords,
      section: 'urlKeywords',
      setKeywords: (keywords: string[]) => {
        updateModalState({ urlKeywords: keywords })
      },
    })
  }, [addKeyword, newUrlKeyword, urlKeywords, updateModalState])

  const handleUrlRemoveKeyword = useCallback(
    (keyword: string) => {
      removeKeyword(
        keyword,
        'urlKeywords',
        (keywords: string[]) => {
          updateModalState({ urlKeywords: keywords })
        },
        urlKeywords,
      )
    },
    [removeKeyword, urlKeywords, updateModalState],
  )

  const handleDomainKeywordChange = useCallback(
    (value: string) => {
      updateModalState({ newDomainKeyword: value })
    },
    [updateModalState],
  )

  const handleDomainAddKeyword = useCallback(() => {
    addKeyword({
      clearInput: () => {
        updateModalState({ newDomainKeyword: '' })
      },
      keyword: newDomainKeyword,
      keywords: domainKeywords,
      section: 'domainKeywords',
      setKeywords: (keywords: string[]) => {
        updateModalState({ domainKeywords: keywords })
      },
    })
  }, [addKeyword, newDomainKeyword, domainKeywords, updateModalState])

  const handleDomainBlurKeyword = useCallback(() => {
    addKeyword({
      clearInput: () => {
        updateModalState({ newDomainKeyword: '' })
      },
      keyword: newDomainKeyword,
      keywords: domainKeywords,
      section: 'domainKeywords',
      setKeywords: (keywords: string[]) => {
        updateModalState({ domainKeywords: keywords })
      },
    })
  }, [addKeyword, newDomainKeyword, domainKeywords, updateModalState])

  const handleDomainRemoveKeyword = useCallback(
    (keyword: string) => {
      removeKeyword(
        keyword,
        'domainKeywords',
        (keywords: string[]) => {
          updateModalState({ domainKeywords: keywords })
        },
        domainKeywords,
      )
    },
    [removeKeyword, domainKeywords, updateModalState],
  )

  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto'>
        <DialogHeader className='text-left'>
          <DialogTitle>
            {t('savedTabs.projectManagement.title', undefined, {
              name: localProjectName,
            })}
          </DialogTitle>
        </DialogHeader>

        <div className='gap-y-4'>
          <div className='mb-4'>
            <div className='mb-2 flex items-center justify-between'>
              <Label>{t('savedTabs.projectManagement.nameLabel')}</Label>
              <ProjectActions
                isRenaming={isRenaming}
                isUncategorizedProject={isUncategorizedProject}
                isProcessing={isProcessing}
                handleStartRenaming={handleStartRenaming}
                handleShowDeleteConfirm={handleShowDeleteConfirm}
                renameActionLabel={t(
                  'savedTabs.projectManagement.renameAction',
                )}
                deleteActionLabel={t(
                  'savedTabs.projectManagement.deleteAction',
                )}
              />
            </div>

            {isRenaming ? (
              <div className='mt-2 w-full rounded border p-3'>
                <div className='mb-2 text-sm text-zinc-300'>
                  {t('savedTabs.projectManagement.renamePrompt')}
                </div>
                <Input
                  ref={inputRef}
                  value={newProjectName}
                  onChange={handleProjectNameChange}
                  placeholder={t(
                    'savedTabs.projectManagement.renamePlaceholder',
                  )}
                  className={`w-full flex-1 rounded border p-2 ${projectNameError ? 'border-red-500' : ''}`}
                  onBlur={handleRenameBlur}
                  onKeyDown={handleRenameKeyDown}
                />
                {projectNameError && (
                  <p className='mt-1 text-xs text-red-500'>
                    {projectNameError}
                  </p>
                )}
              </div>
            ) : (
              <Button
                onClick={handleNameClick}
                className='w-full justify-start rounded border bg-secondary/20 p-2 hover:bg-secondary/30'
                disabled={isUncategorizedProject}
                type='button'
                variant='outline'
              >
                {localProjectName}
              </Button>
            )}
          </div>

          <div className='rounded border p-3'>
            <div className='mb-3 gap-y-1'>
              <Label>{t('savedTabs.projectManagement.autoAssignLabel')}</Label>
              <p className='text-xs text-muted-foreground'>
                {t('savedTabs.projectManagement.autoAssignDescription')}
              </p>
            </div>

            <div className='gap-y-3'>
              <ProjectKeywordSection
                label={t('savedTabs.projectManagement.keywordTitleLabel')}
                description={t(
                  'savedTabs.projectManagement.keywordTitleDescription',
                )}
                inputId='project-title-keywords'
                placeholder={t(
                  'savedTabs.projectManagement.keywordTitlePlaceholder',
                )}
                keywords={titleKeywords}
                newKeyword={newTitleKeyword}
                disabled={isProcessing}
                onKeywordChange={handleTitleKeywordChange}
                onAddKeyword={handleTitleAddKeyword}
                onBlurKeyword={handleTitleBlurKeyword}
                onRemoveKeyword={handleTitleRemoveKeyword}
              />

              <ProjectKeywordSection
                label={t('savedTabs.projectManagement.keywordUrlLabel')}
                description={t(
                  'savedTabs.projectManagement.keywordUrlDescription',
                )}
                inputId='project-url-keywords'
                placeholder={t(
                  'savedTabs.projectManagement.keywordUrlPlaceholder',
                )}
                keywords={urlKeywords}
                newKeyword={newUrlKeyword}
                disabled={isProcessing}
                onKeywordChange={handleUrlKeywordChange}
                onAddKeyword={handleUrlAddKeyword}
                onBlurKeyword={handleUrlBlurKeyword}
                onRemoveKeyword={handleUrlRemoveKeyword}
              />

              <ProjectKeywordSection
                label={t('savedTabs.projectManagement.keywordDomainLabel')}
                description={t(
                  'savedTabs.projectManagement.keywordDomainDescription',
                )}
                inputId='project-domain-keywords'
                placeholder={t(
                  'savedTabs.projectManagement.keywordDomainPlaceholder',
                )}
                keywords={domainKeywords}
                newKeyword={newDomainKeyword}
                disabled={isProcessing}
                onKeywordChange={handleDomainKeywordChange}
                onAddKeyword={handleDomainAddKeyword}
                onBlurKeyword={handleDomainBlurKeyword}
                onRemoveKeyword={handleDomainRemoveKeyword}
              />
            </div>
          </div>

          {showDeleteConfirm && (
            <DeleteEntityConfirmPanel
              description={
                <>
                  {t(
                    'savedTabs.projectManagement.deleteConfirmDescription',
                    undefined,
                    {
                      name: localProjectName,
                    },
                  )}
                  <span className='mt-1 block max-w-full truncate text-xs'>
                    {t('savedTabs.projectManagement.deleteConfirmHint')}
                  </span>
                </>
              }
              cancelLabel={t('common.cancel')}
              deleteLabel={t('common.delete')}
              deleteTooltip={t('savedTabs.projectManagement.deleteAction')}
              isProcessing={isProcessing}
              onCancel={handleCancelDelete}
              // eslint-disable-next-line typescript/no-misused-promises
              onDelete={handleDeleteProject}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const ProjectManagementModalContent = (props: ProjectManagementModalProps) =>
  useProjectManagementModalView(props)

export const ProjectManagementModal = (props: ProjectManagementModalProps) => {
  if (!props.isOpen) {
    return null
  }

  return (
    <ProjectManagementModalContent
      {...props}
      key={`${props.project.id}:${props.project.name}`}
    />
  )
}
