import { useState } from 'react'

import {
  createAiSystemPromptPreset,
  getActiveAiSystemPrompt,
  MAX_AI_SYSTEM_PROMPT_PRESETS,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import type { AppLanguage } from '@/features/i18n/messages'
import { saveUserSettings } from '@/lib/storage/settings'
import type { AiSystemPromptPreset, UserSettings } from '@/types/storage'

import type { TranslateFn } from './messages'
import {
  createSystemPromptId,
  getPromptManagerValidationError,
  getSelectedPrompt,
  getUniquePromptName,
} from './prompts'

const useChatPromptManager = ({
  resolvedSettings,
  activeSystemPrompt,
  language,
  t,
  handleResetConversation,
  onSettingsChange,
}: {
  resolvedSettings: UserSettings
  activeSystemPrompt: AiSystemPromptPreset
  language: AppLanguage
  t: TranslateFn
  handleResetConversation: () => void
  onSettingsChange: (nextSettings: UserSettings) => void
}) => {
  const [isPromptManagerOpen, setIsPromptManagerOpen] = useState(false)
  const [draftState, setDraftState] = useState<{
    promptDrafts: AiSystemPromptPreset[]
    selectedPromptIdInModal: string
    draftActivePromptId: string
  }>({
    promptDrafts: [],
    selectedPromptIdInModal: '',
    draftActivePromptId: '',
  })
  const { promptDrafts, selectedPromptIdInModal, draftActivePromptId } =
    draftState
  const setSelectedPromptIdInModal = (id: string) => {
    setDraftState((current) => ({ ...current, selectedPromptIdInModal: id }))
  }
  const [promptManagerError, setPromptManagerError] = useState('')
  const [isSavingPrompts, setIsSavingPrompts] = useState(false)

  const handleOpenSystemPromptManager = () => {
    setDraftState({
      promptDrafts: resolvedSettings.aiSystemPrompts ?? [],
      selectedPromptIdInModal: activeSystemPrompt.id,
      draftActivePromptId: resolvedSettings.activeAiSystemPromptId ?? '',
    })
    setPromptManagerError('')
    setIsPromptManagerOpen(true)
  }

  const handleCancelSystemPromptManager = () => {
    setIsPromptManagerOpen(false)
    setPromptManagerError('')
    setDraftState({
      promptDrafts: [],
      selectedPromptIdInModal: '',
      draftActivePromptId: '',
    })
  }

  const handlePromptManagerOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      handleOpenSystemPromptManager()
      return
    }

    handleCancelSystemPromptManager()
  }

  const updateSelectedPromptDraft = (
    update: (prompt: AiSystemPromptPreset) => AiSystemPromptPreset,
  ) => {
    setPromptManagerError('')
    setDraftState((current) => ({
      ...current,
      promptDrafts: current.promptDrafts.map((prompt) =>
        prompt.id === current.selectedPromptIdInModal ? update(prompt) : prompt,
      ),
    }))
  }

  const handleChangePromptName = (value: string) => {
    const updatedAt = Date.now()
    updateSelectedPromptDraft((prompt) => ({
      ...prompt,
      name: value,
      updatedAt,
    }))
  }

  const handleChangePromptTemplate = (value: string) => {
    const updatedAt = Date.now()
    updateSelectedPromptDraft((prompt) => ({
      ...prompt,
      template: value,
      updatedAt,
    }))
  }

  const handleCreatePrompt = () => {
    setPromptManagerError('')
    const id = createSystemPromptId()
    const now = Date.now()
    setDraftState((current) => {
      const currentPrompts = current.promptDrafts
      if (currentPrompts.length >= MAX_AI_SYSTEM_PROMPT_PRESETS) {
        return current
      }

      const nextPrompt = createAiSystemPromptPreset({
        id,
        now,
        language,
        name: getUniquePromptName(
          currentPrompts,
          t('aiChat.systemPrompt.new'),
          t,
        ),
        template: '',
      })

      return {
        ...current,
        selectedPromptIdInModal: nextPrompt.id,
        promptDrafts: [...currentPrompts, nextPrompt],
      }
    })
  }

  const handleDuplicatePrompt = () => {
    setPromptManagerError('')
    const id = createSystemPromptId()
    const now = Date.now()
    setDraftState((current) => {
      const currentPrompts = current.promptDrafts
      const selectedPrompt = getSelectedPrompt(
        currentPrompts,
        current.selectedPromptIdInModal,
      )
      if (
        !selectedPrompt ||
        currentPrompts.length >= MAX_AI_SYSTEM_PROMPT_PRESETS
      ) {
        return current
      }

      const nextPrompt = createAiSystemPromptPreset({
        id,
        now,
        language,
        name: getUniquePromptName(
          currentPrompts,
          selectedPrompt.name,
          t,
          t('aiChat.systemPrompt.copySuffix'),
        ),
        template: selectedPrompt.template,
      })

      return {
        ...current,
        selectedPromptIdInModal: nextPrompt.id,
        promptDrafts: [...currentPrompts, nextPrompt],
      }
    })
  }

  const handleDeletePrompt = () => {
    setPromptManagerError('')
    setDraftState((current) => {
      const currentPrompts = current.promptDrafts
      if (currentPrompts.length <= 1) {
        return current
      }

      const selectedIndex = currentPrompts.findIndex(
        (prompt) => prompt.id === current.selectedPromptIdInModal,
      )
      if (selectedIndex === -1) {
        return current
      }

      const nextPrompts = currentPrompts.filter(
        (prompt) => prompt.id !== current.selectedPromptIdInModal,
      )
      const fallbackIndex =
        selectedIndex >= nextPrompts.length ? selectedIndex - 1 : selectedIndex
      const fallbackPrompt = nextPrompts.at(fallbackIndex)

      if (!fallbackPrompt) {
        return current
      }
      return {
        promptDrafts: nextPrompts,
        selectedPromptIdInModal: fallbackPrompt.id,
        draftActivePromptId:
          current.draftActivePromptId === current.selectedPromptIdInModal
            ? fallbackPrompt.id
            : current.draftActivePromptId,
      }
    })
  }

  const handleSavePromptManager = async () => {
    const validationError = getPromptManagerValidationError(promptDrafts, t)
    if (validationError) {
      return
    }

    const normalizedPrompts = promptDrafts.map((prompt) => ({
      ...prompt,
      name: prompt.name.trim(),
      template: prompt.template.trim(),
    }))

    const nextSettings = normalizeAiSystemPromptSettings({
      ...resolvedSettings,
      activeAiSystemPromptId:
        draftActivePromptId || normalizedPrompts[0]?.id || '',
      aiSystemPrompts: normalizedPrompts,
    })

    setIsSavingPrompts(true)
    setPromptManagerError('')

    try {
      await saveUserSettings(nextSettings)

      const nextActivePrompt = getActiveAiSystemPrompt(nextSettings)
      const shouldResetConversation =
        nextActivePrompt.id !== activeSystemPrompt.id ||
        nextActivePrompt.template !== activeSystemPrompt.template

      onSettingsChange(nextSettings)
      handleCancelSystemPromptManager()

      if (shouldResetConversation) {
        handleResetConversation()
      }
    } catch {
      setPromptManagerError(t('aiChat.systemPrompt.saveError'))
    } finally {
      setIsSavingPrompts(false)
    }
  }

  const promptManagerValidationError = getPromptManagerValidationError(
    promptDrafts,
    t,
  )
  const promptManagerDisplayError =
    promptManagerValidationError || promptManagerError
  const isPromptManagerSaveDisabled =
    isSavingPrompts ||
    promptDrafts.length === 0 ||
    Boolean(promptManagerValidationError)

  return {
    isPromptManagerOpen,
    setIsPromptManagerOpen,
    promptDrafts,
    selectedPromptIdInModal,
    setSelectedPromptIdInModal,
    draftActivePromptId,
    promptManagerError,
    setPromptManagerError,
    isSavingPrompts,
    handleOpenSystemPromptManager,
    handleCancelSystemPromptManager,
    handlePromptManagerOpenChange,
    handleChangePromptName,
    handleChangePromptTemplate,
    handleCreatePrompt,
    handleDuplicatePrompt,
    handleDeletePrompt,
    handleSavePromptManager,
    promptManagerValidationError,
    promptManagerDisplayError,
    isPromptManagerSaveDisabled,
  }
}

export { useChatPromptManager }
