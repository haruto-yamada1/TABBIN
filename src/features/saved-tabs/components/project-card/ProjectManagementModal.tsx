import { Edit, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { z } from 'zod'

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
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { DeleteEntityConfirmPanel } from '@/features/saved-tabs/components/shared/DeleteEntityConfirmPanel'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from '@/features/saved-tabs/components/shared/SavedTabsResponsive'
import { CUSTOM_UNCATEGORIZED_PROJECT_ID } from '@/lib/storage/projects'
import type { CustomProject, ProjectKeywordSettings } from '@/types/storage'

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

const createProjectNameSchema = (
  validationMessages: { empty: string; maxLength: string } = {
    empty: 'プロジェクト名を入力してください',
    maxLength: 'プロジェクト名は50文字以下で入力してください',
  },
) =>
  z
    .string()
    .trim()
    .min(1, {
      message: validationMessages.empty,
    })
    // eslint-disable-next-line eslint/no-magic-numbers
    .max(50, {
      message: validationMessages.maxLength,
    })

const projectNameSchema = {
  safeParse(value: string) {
    return this.schema.safeParse(value)
  },
  schema: createProjectNameSchema(),
}

const normalizeKeyword = (value: string): string => value.trim()

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

interface KeywordUpdateParams {
  keyword: string
  keywords: string[]
  section: keyof ProjectKeywordSettings
  setKeywords: (keywords: string[]) => void
  clearInput: () => void
}

interface ProjectManagementModalState {
  isRenaming: boolean
  newProjectName: string
  isProcessing: boolean
  isSaving: boolean
  localProjectName: string
  projectNameError: string | null
  showDeleteConfirm: boolean
  titleKeywords: string[]
  urlKeywords: string[]
  domainKeywords: string[]
  newTitleKeyword: string
  newUrlKeyword: string
  newDomainKeyword: string
}

const createProjectManagementModalState = (
  project: CustomProject,
): ProjectManagementModalState => ({
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  domainKeywords: project.projectKeywords?.domainKeywords || [],
  isProcessing: false,
  isRenaming: false,
  isSaving: false,
  localProjectName: project.name,
  newDomainKeyword: '',
  newProjectName: project.name,
  newTitleKeyword: '',
  newUrlKeyword: '',
  projectNameError: null,
  showDeleteConfirm: false,
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  titleKeywords: project.projectKeywords?.titleKeywords || [],
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  urlKeywords: project.projectKeywords?.urlKeywords || [],
})

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
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onChange={(e) => {
          onKeywordChange(e.target.value)
        }}
        placeholder={placeholder}
        disabled={disabled}
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onAddKeyword()
          }
        }}
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
  const isUncategorizedProject = project.id === CUSTOM_UNCATEGORIZED_PROJECT_ID
  const [modalState, setModalState] = useState(() =>
    createProjectManagementModalState(project),
  )
  const {
    isRenaming,
    newProjectName,
    isProcessing,
    isSaving,
    localProjectName,
    projectNameError,
    showDeleteConfirm,
    titleKeywords,
    urlKeywords,
    domainKeywords,
    newTitleKeyword,
    newUrlKeyword,
    newDomainKeyword,
  } = modalState
  const updateModalState = (updates: Partial<ProjectManagementModalState>) => {
    setModalState((current) => ({ ...current, ...updates }))
  }

  const inputRef = useRef<HTMLInputElement>(null)

  // 入力値バリデーション関数
  const validateProjectName = (name: string) => {
    projectNameSchema.schema = localizedProjectNameSchema
    const result = projectNameSchema.safeParse(name)
    if (!result.success) {
      const issue = result.error.issues[0]
      if (issue?.code === 'too_small') {
        updateModalState({
          projectNameError: t('savedTabs.projectNameRequired'),
        })
      } else if (issue?.code === 'too_big') {
        updateModalState({
          projectNameError: t('savedTabs.projectNameMaxLength'),
        })
      } else {
        updateModalState({
          projectNameError: t('savedTabs.projectNameRequired'),
        })
      }
      return false
    }
    updateModalState({ projectNameError: null })
    return true
  }

  // リネーム処理を開始
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleStartRenaming = () => {
    updateModalState({
      isRenaming: true,
      newProjectName: localProjectName,
      projectNameError: null,
    })
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      }
    })
  }

  // リネームをキャンセル
  const handleCancelRenaming = () => {
    updateModalState({
      isRenaming: false,
      newProjectName: localProjectName,
      projectNameError: null,
    })
  }

  // 入力変更時の処理
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleProjectNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    updateModalState({ newProjectName: value })
    validateProjectName(value)
  }

  // 名前変更の保存処理
  const handleSaveRenaming = async (trimmedName: string) => {
    updateModalState({ isProcessing: true, isSaving: true })

    try {
      if (!onRenameProject) {
        throw new Error('プロジェクト名変更機能が利用できません')
      }

      await onRenameProject(project.id, trimmedName)

      updateModalState({
        isRenaming: false,
        localProjectName: trimmedName,
      })
    } catch (error) {
      console.error('プロジェクト名の更新に失敗:', error)
      // エラー表示は useProjectManagement 側で行われることが多いため、ここでは最小限に
    } finally {
      updateModalState({ isProcessing: false, isSaving: false })
    }
  }

  // プロジェクト削除処理
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDeleteProject = async () => {
    if (isProcessing) {
      return
    }

    updateModalState({ isProcessing: true })
    try {
      if (!onDeleteProject) {
        throw new Error('プロジェクト削除機能が利用できません')
      }

      await onDeleteProject(project.id)
      onClose()
    } catch (error) {
      console.error('プロジェクトの削除に失敗しました:', error)
    } finally {
      updateModalState({ isProcessing: false })
    }
  }

  const handleSaveProjectKeywords = async (
    nextProjectKeywords: ProjectKeywordSettings = {
      domainKeywords,
      titleKeywords,
      urlKeywords,
    },
  ) => {
    try {
      if (!onUpdateProjectKeywords) {
        throw new Error('プロジェクトキーワード更新機能が利用できません')
      }

      await onUpdateProjectKeywords(project.id, {
        domainKeywords: nextProjectKeywords.domainKeywords,
        titleKeywords: nextProjectKeywords.titleKeywords,
        urlKeywords: nextProjectKeywords.urlKeywords,
      })
    } catch (error) {
      console.error('プロジェクトキーワードの更新に失敗:', error)
    }
  }

  const addKeyword = ({
    keyword,
    keywords,
    section,
    setKeywords,
    clearInput,
  }: KeywordUpdateParams) => {
    const normalizedKeyword = normalizeKeyword(keyword)
    if (!normalizedKeyword) {
      return
    }
    const isDuplicate = keywords.some(
      (currentKeyword) =>
        currentKeyword.toLowerCase() === normalizedKeyword.toLowerCase(),
    )
    if (isDuplicate) {
      clearInput()
      return
    }
    const updatedKeywords = [...keywords, normalizedKeyword]
    setKeywords(updatedKeywords)
    clearInput()
    void handleSaveProjectKeywords({
      domainKeywords:
        section === 'domainKeywords' ? updatedKeywords : domainKeywords,
      titleKeywords:
        section === 'titleKeywords' ? updatedKeywords : titleKeywords,
      urlKeywords: section === 'urlKeywords' ? updatedKeywords : urlKeywords,
    })
  }

  const removeKeyword = (
    keywordToRemove: string,
    section: keyof ProjectKeywordSettings,
    setKeywords: (keywords: string[]) => void,
    keywords: string[],
  ) => {
    const updatedKeywords = keywords.filter(
      (keyword) => keyword !== keywordToRemove,
    )
    setKeywords(updatedKeywords)
    void handleSaveProjectKeywords({
      domainKeywords:
        section === 'domainKeywords' ? updatedKeywords : domainKeywords,
      titleKeywords:
        section === 'titleKeywords' ? updatedKeywords : titleKeywords,
      urlKeywords: section === 'urlKeywords' ? updatedKeywords : urlKeywords,
    })
  }

  if (!isOpen) {
    return null
  }

  return (
    <Dialog
      open={isOpen}
      // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                      // eslint-disable-next-line typescript/no-floating-promises
                      handleSaveRenaming(trimmedName)
                    } else if (projectNameError) {
                      inputRef.current?.focus()
                    } else {
                      handleCancelRenaming()
                    }
                  }}
                  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                        // eslint-disable-next-line typescript/no-floating-promises
                        handleSaveRenaming(trimmedName)
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                onKeywordChange={(value) => {
                  updateModalState({ newTitleKeyword: value })
                }}
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                onKeywordChange={(value) => {
                  updateModalState({ newUrlKeyword: value })
                }}
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                onKeywordChange={(value) => {
                  updateModalState({ newDomainKeyword: value })
                }}
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
                // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
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
