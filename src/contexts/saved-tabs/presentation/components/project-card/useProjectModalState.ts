import { useRef, useState } from 'react'

import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { CustomProject, ProjectKeywordSettings } from '@/types/storage'

import { projectNameSchema } from './useProjectNameSchema'
import type { ProjectNameSchema } from './useProjectNameSchema'

const normalizeKeyword = (value: string): string => value.trim()

export interface ProjectManagementModalState {
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
  domainKeywords: project.projectKeywords?.domainKeywords ?? [],
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
  titleKeywords: project.projectKeywords?.titleKeywords ?? [],
  urlKeywords: project.projectKeywords?.urlKeywords ?? [],
})

export interface KeywordUpdateParams {
  keyword: string
  keywords: string[]
  section: keyof ProjectKeywordSettings
  setKeywords: (keywords: string[]) => void
  clearInput: () => void
}

export const useProjectModalState = (
  project: CustomProject,
  {
    onRenameProject,
    onUpdateProjectKeywords,
    onDeleteProject,
    onClose,
  }: {
    onRenameProject?: (
      projectId: string,
      newName: string,
    ) => Promise<void> | void
    onUpdateProjectKeywords?: (
      projectId: string,
      projectKeywords: ProjectKeywordSettings,
    ) => Promise<void> | void
    onDeleteProject?: (projectId: string) => Promise<void> | void
    onClose: () => void
  },
  localizedProjectNameSchema: ProjectNameSchema,
) => {
  const { t } = useI18n()
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
      if (issue.code === 'too_small') {
        updateModalState({
          projectNameError: t('savedTabs.projectNameRequired'),
        })
      } else if (issue.code === 'too_big') {
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

  return {
    addKeyword,
    domainKeywords,
    handleCancelRenaming,
    handleDeleteProject,
    handleProjectNameChange,
    handleSaveRenaming,
    handleSaveProjectKeywords,
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
    validateProjectName,
  }
}
