import { useCallback, useEffect, useRef, useState } from 'react'

import type { OllamaErrorPlatform } from '@/features/ai-chat/components/OllamaErrorNotice'
import {
  getRuntimePlatform,
  requestOllamaModels,
} from '@/features/ai-chat/components/savedTabsChat/streaming'
import { normalizeAiSystemPromptSettings } from '@/features/ai-chat/lib/systemPromptPresets'
import { saveUserSettings } from '@/lib/storage/settings'
import type { OllamaErrorDetails } from '@/types/background'
import type { UserSettings } from '@/types/storage'

type OllamaModelOption = {
  label: string
  name: string
}

type UseOllamaModelSettingsOptions = {
  onSettingsSaved: (settings: UserSettings) => void
  settings: UserSettings
  t: (key: string) => string
}

const useOllamaModelSettings = ({
  onSettingsSaved,
  settings,
  t,
}: UseOllamaModelSettingsOptions) => {
  const [modelOptions, setModelOptions] = useState<OllamaModelOption[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isSavingModel, setIsSavingModel] = useState(false)
  const [setupErrorMessage, setSetupErrorMessage] = useState('')
  const [setupOllamaError, setSetupOllamaError] = useState<
    OllamaErrorDetails | undefined
  >(undefined)
  const [platform, setPlatform] = useState<OllamaErrorPlatform>('unknown')
  const isMountedRef = useRef(true)
  const fetchPromiseRef = useRef<Promise<void> | null>(null)
  const isSaveInFlightRef = useRef(false)
  const onSettingsSavedRef = useRef(onSettingsSaved)
  onSettingsSavedRef.current = onSettingsSaved

  useEffect(() => {
    isMountedRef.current = true

    void getRuntimePlatform().then((nextPlatform) => {
      if (isMountedRef.current) {
        setPlatform(nextPlatform)
      }
    })

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const requestModels = useCallback(async (): Promise<void> => {
    if (fetchPromiseRef.current) {
      return fetchPromiseRef.current
    }

    setIsLoadingModels(true)
    setSetupErrorMessage('')
    setSetupOllamaError(undefined)

    const requestPromise = (async () => {
      try {
        const response = await requestOllamaModels()
        if (!isMountedRef.current) {
          return
        }

        if (response?.status !== 'ok' || !response.models) {
          setModelOptions([])
          setSetupErrorMessage(
            response?.error || t('aiChat.modelListLoadError'), // eslint-disable-line typescript/prefer-nullish-coalescing -- empty error uses the localized fallback
          )
          setSetupOllamaError(response?.ollamaError)
          return
        }

        setModelOptions(
          response.models.map((model) => ({
            label: model.label,
            name: model.name,
          })),
        )
        setSetupOllamaError(undefined)
      } catch {
        if (isMountedRef.current) {
          setModelOptions([])
          setSetupErrorMessage(t('aiChat.modelListLoadError'))
          setSetupOllamaError(undefined)
        }
      } finally {
        fetchPromiseRef.current = null
        if (isMountedRef.current) {
          setIsLoadingModels(false)
        }
      }
    })()

    fetchPromiseRef.current = requestPromise
    return requestPromise
  }, [t])

  const selectModel = useCallback(
    async (modelName: string): Promise<boolean> => {
      if (isSaveInFlightRef.current) {
        return false
      }

      isSaveInFlightRef.current = true
      setIsSavingModel(true)
      setSetupErrorMessage('')
      setSetupOllamaError(undefined)

      const nextSettings = normalizeAiSystemPromptSettings({
        ...settings,
        ollamaModel: modelName,
      })

      try {
        await saveUserSettings(nextSettings)
        if (!isMountedRef.current) {
          return false
        }

        onSettingsSavedRef.current(nextSettings)
        return true
      } catch {
        if (isMountedRef.current) {
          setSetupErrorMessage(t('aiChat.modelSettingsSaveError'))
        }
        return false
      } finally {
        isSaveInFlightRef.current = false
        if (isMountedRef.current) {
          setIsSavingModel(false)
        }
      }
    },
    [settings, t],
  )

  return {
    isLoadingModels,
    isSavingModel,
    modelOptions,
    platform,
    requestModels,
    selectModel,
    setupErrorMessage,
    setupOllamaError,
  }
}

export { useOllamaModelSettings }
export type { OllamaModelOption }
