import { Edit, Trash2, X } from 'lucide-react'
import { useMemo } from 'react'

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
import { UNCATEGORIZED_PROJECT_ID } from '@/contexts/saved-tabs/domain/entities/UncategorizedProject'
import { DeleteEntityConfirmPanel } from '@/contexts/saved-tabs/presentation/components/shared/DeleteEntityConfirmPanel'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/contexts/saved-tabs/presentation/components/shared/SavedTabsResponsive'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { CustomProject, ProjectKeywordSettings } from '@/types/storage'

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

  return (
    <div className='gap-y-2'>
      <Label htmlFor={inputId}>{label}</Label>
      <p className='text-xs text-muted-foreground'>{description}</p>
      <Input
        id={inputId}
        aria-label={label}
        value={newKeyword}
        onChange={(e) => {
          onKeywordChange(e.target.value)
        }}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onAddKeyword()
          }
        }}
        onBlur={() => {
          if (newKeyword.trim()) {
            onBlurKeyword()
          }
        }}
      />

      <div className='flex min-h-12 flex-wrap gap-2 rounded border p-2'>
        {keywords.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('savedTabs.keywords.empty')}
          </p>
        ) : (
          keywords.map((keyword) => (
            <Badge
              key={keyword}
              variant='outline'
              className='flex items-center gap-1 rounded px-2 py-1'
            >
              {keyword}
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  onRemoveKeyword(keyword)
                }}
                className='h-5 px-1'
                aria-label={t('savedTabs.keywords.deleteAria')}
                disabled={disabled}
              >
                <X size={14} />
              </Button>
            </Badge>
          ))
        )}
      </div>
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

  if (!isOpen) {
    return null
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={() => {
        if (isProcessing || isRenaming || isSaving) {
          return
        }
        if (document.readyState === 'loading') {
          return
        }
        onClose()
      }}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto'>
        <DialogHeader className='text-left'>
          <DialogTitle>
            {t('savedTabs.projectManagement.title', undefined, {
              name: localProjectName,
            })}
          </DialogTitle>
        </DialogHeader>

        <div className='gap-y-4'>
          {/* プロジェクト名変更セクション */}
          <div className='mb-4'>
            <div className='mb-2 flex items-center justify-between'>
              <Label>{t('savedTabs.projectManagement.nameLabel')}</Label>
              {!isRenaming && !isUncategorizedProject && (
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
                          {t('savedTabs.projectManagement.renameAction')}
                        </SavedTabsResponsiveLabel>
                      </Button>
                    </TooltipTrigger>
                    <SavedTabsResponsiveTooltipContent side='top'>
                      {t('savedTabs.projectManagement.renameAction')}
                    </SavedTabsResponsiveTooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant='secondary'
                        size='sm'
                        onClick={() => {
                          updateModalState({ showDeleteConfirm: true })
                        }}
                        className='flex cursor-pointer items-center gap-2 rounded px-2 py-1'
                        disabled={isProcessing}
                      >
                        <Trash2 size={14} />
                        <SavedTabsResponsiveLabel>
                          {t('savedTabs.projectManagement.deleteAction')}
                        </SavedTabsResponsiveLabel>
                      </Button>
                    </TooltipTrigger>
                    <SavedTabsResponsiveTooltipContent side='top'>
                      {t('savedTabs.projectManagement.deleteAction')}
                    </SavedTabsResponsiveTooltipContent>
                  </Tooltip>
                </div>
              )}
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
                  onBlur={() => {
                    if (isProcessing) {
                      return
                    }
                    const trimmedName = newProjectName.trim()
                    if (
                      trimmedName &&
                      trimmedName !== localProjectName &&
                      !projectNameError
                    ) {
                      void handleSaveRenaming(trimmedName)
                    } else if (projectNameError) {
                      inputRef.current?.focus()
                    } else {
                      handleCancelRenaming()
                    }
                  }}
                  onKeyDown={(e) => {
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
                  }}
                />
                {projectNameError && (
                  <p className='mt-1 text-xs text-red-500'>
                    {projectNameError}
                  </p>
                )}
              </div>
            ) : (
              <Button
                onClick={() => {
                  if (isUncategorizedProject) {
                    return
                  }
                  handleStartRenaming()
                }}
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
                onKeywordChange={(value) => {
                  updateModalState({ newTitleKeyword: value })
                }}
                onAddKeyword={() => {
                  addKeyword({
                    clearInput: () => {
                      updateModalState({ newTitleKeyword: '' })
                    },
                    keyword: newTitleKeyword,
                    keywords: titleKeywords,
                    section: 'titleKeywords',
                    setKeywords: (keywords) => {
                      updateModalState({ titleKeywords: keywords })
                    },
                  })
                }}
                onBlurKeyword={() => {
                  addKeyword({
                    clearInput: () => {
                      updateModalState({ newTitleKeyword: '' })
                    },
                    keyword: newTitleKeyword,
                    keywords: titleKeywords,
                    section: 'titleKeywords',
                    setKeywords: (keywords) => {
                      updateModalState({ titleKeywords: keywords })
                    },
                  })
                }}
                onRemoveKeyword={(keyword) => {
                  removeKeyword(
                    keyword,
                    'titleKeywords',
                    (keywords) => {
                      updateModalState({ titleKeywords: keywords })
                    },
                    titleKeywords,
                  )
                }}
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
                onKeywordChange={(value) => {
                  updateModalState({ newUrlKeyword: value })
                }}
                onAddKeyword={() => {
                  addKeyword({
                    clearInput: () => {
                      updateModalState({ newUrlKeyword: '' })
                    },
                    keyword: newUrlKeyword,
                    keywords: urlKeywords,
                    section: 'urlKeywords',
                    setKeywords: (keywords) => {
                      updateModalState({ urlKeywords: keywords })
                    },
                  })
                }}
                onBlurKeyword={() => {
                  addKeyword({
                    clearInput: () => {
                      updateModalState({ newUrlKeyword: '' })
                    },
                    keyword: newUrlKeyword,
                    keywords: urlKeywords,
                    section: 'urlKeywords',
                    setKeywords: (keywords) => {
                      updateModalState({ urlKeywords: keywords })
                    },
                  })
                }}
                onRemoveKeyword={(keyword) => {
                  removeKeyword(
                    keyword,
                    'urlKeywords',
                    (keywords) => {
                      updateModalState({ urlKeywords: keywords })
                    },
                    urlKeywords,
                  )
                }}
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
                onKeywordChange={(value) => {
                  updateModalState({ newDomainKeyword: value })
                }}
                onAddKeyword={() => {
                  addKeyword({
                    clearInput: () => {
                      updateModalState({ newDomainKeyword: '' })
                    },
                    keyword: newDomainKeyword,
                    keywords: domainKeywords,
                    section: 'domainKeywords',
                    setKeywords: (keywords) => {
                      updateModalState({ domainKeywords: keywords })
                    },
                  })
                }}
                onBlurKeyword={() => {
                  addKeyword({
                    clearInput: () => {
                      updateModalState({ newDomainKeyword: '' })
                    },
                    keyword: newDomainKeyword,
                    keywords: domainKeywords,
                    section: 'domainKeywords',
                    setKeywords: (keywords) => {
                      updateModalState({ domainKeywords: keywords })
                    },
                  })
                }}
                onRemoveKeyword={(keyword) => {
                  removeKeyword(
                    keyword,
                    'domainKeywords',
                    (keywords) => {
                      updateModalState({ domainKeywords: keywords })
                    },
                    domainKeywords,
                  )
                }}
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
              onCancel={() => {
                updateModalState({ showDeleteConfirm: false })
              }}
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
      key={`${props.project.id}:${props.project.name}`}
      {...props}
    />
  )
}
