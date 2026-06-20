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
  const [promptDrafts, setPromptDrafts] = useState<AiSystemPromptPreset[]>([])
  const [selectedPromptIdInModal, setSelectedPromptIdInModal] = useState('')
  const [draftActivePromptId, setDraftActivePromptId] = useState('')
  const [promptManagerError, setPromptManagerError] = useState('')
  const [isSavingPrompts, setIsSavingPrompts] = useState(false)

  const handleOpenSystemPromptManager = () => {
    setPromptDrafts(resolvedSettings.aiSystemPrompts ?? [])
    setSelectedPromptIdInModal(activeSystemPrompt.id)
    setDraftActivePromptId(resolvedSettings.activeAiSystemPromptId ?? '')
    setPromptManagerError('')
    setIsPromptManagerOpen(true)
  }

  const handleCancelSystemPromptManager = () => {
    setIsPromptManagerOpen(false)
    setPromptManagerError('')
    setPromptDrafts([])
    setSelectedPromptIdInModal('')
    setDraftActivePromptId('')
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
    setPromptDrafts((currentPrompts) =>
      currentPrompts.map((prompt) =>
        prompt.id === selectedPromptIdInModal ? update(prompt) : prompt,
      ),
    )
  }

  const handleChangePromptName = (value: string) => {
    updateSelectedPromptDraft((prompt) => ({
      ...prompt,
      name: value,
      updatedAt: Date.now(),
    }))
  }

  const handleChangePromptTemplate = (value: string) => {
    updateSelectedPromptDraft((prompt) => ({
      ...prompt,
      template: value,
      updatedAt: Date.now(),
    }))
  }

  const handleCreatePrompt = () => {
    setPromptManagerError('')
    setPromptDrafts((currentPrompts) => {
      if (currentPrompts.length >= MAX_AI_SYSTEM_PROMPT_PRESETS) {
        return currentPrompts
      }

      const nextPrompt = createAiSystemPromptPreset({
        id: createSystemPromptId(),
        language,
        name: getUniquePromptName(
          currentPrompts,
          t('aiChat.systemPrompt.new'),
          t,
        ),
        template: '',
      })

      setSelectedPromptIdInModal(nextPrompt.id)

      return [...currentPrompts, nextPrompt]
    })
  }

  const handleDuplicatePrompt = () => {
    setPromptManagerError('')
    setPromptDrafts((currentPrompts) => {
      const selectedPrompt = getSelectedPrompt(
        currentPrompts,
        selectedPromptIdInModal,
      )
      if (
        !selectedPrompt ||
        currentPrompts.length >= MAX_AI_SYSTEM_PROMPT_PRESETS
      ) {
        return currentPrompts
      }

      const nextPrompt = createAiSystemPromptPreset({
        id: createSystemPromptId(),
        language,
        name: getUniquePromptName(
          currentPrompts,
          selectedPrompt.name,
          t,
          t('aiChat.systemPrompt.copySuffix'),
        ),
        template: selectedPrompt.template,
      })

      setSelectedPromptIdInModal(nextPrompt.id)

      return [...currentPrompts, nextPrompt]
    })
  }

  const handleDeletePrompt = () => {
    setPromptManagerError('')
    setPromptDrafts((currentPrompts) => {
      if (currentPrompts.length <= 1) {
        return currentPrompts
      }

      const selectedIndex = currentPrompts.findIndex(
        (prompt) => prompt.id === selectedPromptIdInModal,
      )
      if (selectedIndex === -1) {
        return currentPrompts
      }

      const nextPrompts = currentPrompts.filter(
        (prompt) => prompt.id !== selectedPromptIdInModal,
      )
      const fallbackIndex = selectedIndex >= nextPrompts.length ? selectedIndex - 1 : selectedIndex
      const fallbackPrompt = nextPrompts[fallbackIndex]

      if (fallbackPrompt) {
        setSelectedPromptIdInModal(fallbackPrompt.id)

        if (draftActivePromptId === selectedPromptIdInModal) {
          setDraftActivePromptId(fallbackPrompt.id)
        }
      }

      return nextPrompts
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
