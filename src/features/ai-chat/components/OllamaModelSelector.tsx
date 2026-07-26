import { useCallback, useMemo, useRef, useState } from 'react'

import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { OllamaErrorNotice } from '@/features/ai-chat/components/OllamaErrorNotice'
import type { OllamaErrorPlatform } from '@/features/ai-chat/components/OllamaErrorNotice'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'
import type { OllamaErrorDetails } from '@/types/background'

type OllamaModelOption = {
  label: string
  name: string
}

type OllamaModelSelectorProps = {
  behavior?: {
    fetchOnOpen?: boolean
    hideFetchButton?: boolean
  }
  errorMessage?: string
  helperText?: string
  layout?: 'compact' | 'default'
  ollamaError?: OllamaErrorDetails
  status: {
    isLoading: boolean
    isSaving?: boolean
  }
  models: OllamaModelOption[]
  onFetchModels: () => void
  onSelectModel: (modelName: string) => Promise<boolean> | boolean
  platform?: OllamaErrorPlatform
  selectedModel?: string
}

const EMPTY_MODEL_VALUE = '__empty__'

const getSelectableModels = (
  models: OllamaModelOption[],
  selectedModel?: string,
): OllamaModelOption[] => {
  if (!selectedModel) {
    return models
  }

  const hasSelectedModel = models.some((model) => model.name === selectedModel)
  if (hasSelectedModel) {
    return models
  }

  return [
    {
      label: selectedModel,
      name: selectedModel,
    },
    ...models,
  ]
}

const getTriggerDisabled = ({
  fetchOnOpen,
  isLoading,
  isSaving,
  selectableModels,
}: {
  fetchOnOpen: boolean
  isLoading: boolean
  isSaving: boolean
  selectableModels: OllamaModelOption[]
}): boolean =>
  isSaving || (!fetchOnOpen && (isLoading || selectableModels.length === 0))

const FetchModelsButton = ({
  behavior,
  layout,
  onFetchModels,
  status,
  t,
}: {
  behavior: {
    hideFetchButton: boolean
  }
  layout: 'compact' | 'default'
  onFetchModels: () => void
  status: {
    isLoading: boolean
    isSaving: boolean
  }
  t: (key: string) => string
}) => {
  if (behavior.hideFetchButton) {
    return null
  }

  return (
    <Button
      type='button'
      variant='outline'
      onClick={onFetchModels}
      disabled={status.isLoading || status.isSaving}
      className={cn(
        'w-full cursor-pointer',
        layout === 'default' && 'sm:w-auto',
      )}
    >
      {status.isLoading ? <Spinner /> : t('aiChat.ollama.loadModels')}
    </Button>
  )
}

const ModelOptions = ({
  isLoading,
  selectableModels,
  t,
}: {
  isLoading: boolean
  selectableModels: OllamaModelOption[]
  t: (key: string) => string
}) => {
  if (selectableModels.length > 0) {
    return selectableModels.map((model) => (
      <PromptInputSelectItem key={model.name} value={model.name}>
        {model.label}
      </PromptInputSelectItem>
    ))
  }

  return (
    <PromptInputSelectItem disabled value={EMPTY_MODEL_VALUE}>
      {isLoading ? <Spinner /> : t('aiChat.ollama.noModelsFound')}
    </PromptInputSelectItem>
  )
}

const SelectorMessage = ({
  errorMessage,
  helperText,
  ollamaError,
  platform,
}: {
  errorMessage?: string
  helperText?: string
  ollamaError?: OllamaErrorDetails
  platform: OllamaErrorPlatform
}) => {
  if (ollamaError) {
    return (
      <OllamaErrorNotice
        className='text-sm text-destructive'
        error={ollamaError}
        platform={platform}
      />
    )
  }

  if (errorMessage) {
    return (
      <p className='text-sm wrap-break-word whitespace-pre-line text-destructive'>
        {errorMessage}
      </p>
    )
  }

  if (!helperText) {
    return null
  }

  return (
    <p className='text-sm wrap-break-word whitespace-pre-line text-muted-foreground'>
      {helperText}
    </p>
  )
}

// eslint-disable-next-line eslint/complexity
const OllamaModelSelector = ({
  behavior,
  errorMessage,
  helperText,
  layout = 'default',
  ollamaError,
  status,
  models,
  onFetchModels,
  onSelectModel,
  platform = 'unknown',
  selectedModel,
}: OllamaModelSelectorProps) => {
  const { t } = useI18n()
  const fetchOnOpen = behavior?.fetchOnOpen ?? false
  const hideFetchButton = behavior?.hideFetchButton ?? false
  const fetchBehavior = useMemo(() => ({ hideFetchButton }), [hideFetchButton])
  const isCompactLayout = layout === 'compact'
  const { isLoading } = status
  const isSaving = status.isSaving ?? false
  const fetchStatus = useMemo(
    () => ({ isLoading, isSaving }),
    [isLoading, isSaving],
  )
  const selectableModels = useMemo(
    () => getSelectableModels(models, selectedModel),
    [models, selectedModel],
  )
  const [isOpen, setIsOpen] = useState(false)
  const hasError = Boolean(errorMessage || ollamaError) // eslint-disable-line typescript/prefer-nullish-coalescing -- empty error message should fall through
  const previousHasErrorRef = useRef(hasError)
  const isTriggerDisabled = getTriggerDisabled({
    fetchOnOpen,
    isLoading,
    isSaving,
    selectableModels,
  })

  if (hasError !== previousHasErrorRef.current) {
    previousHasErrorRef.current = hasError
    if (hasError && isOpen) {
      setIsOpen(false)
    }
  }

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen)

      if (nextOpen && fetchOnOpen) {
        onFetchModels()
      }
    },
    [fetchOnOpen, onFetchModels],
  )

  const handleValueChange = useCallback(
    (nextValue: string) => {
      if (nextValue === EMPTY_MODEL_VALUE) {
        return
      }

      void onSelectModel(nextValue)
    },
    [onSelectModel],
  )

  return (
    <div className='space-y-3'>
      <div
        className={cn(
          'flex gap-2',
          isCompactLayout ? 'flex-col' : 'flex-col sm:flex-row',
        )}
      >
        <FetchModelsButton
          behavior={fetchBehavior}
          layout={layout}
          onFetchModels={onFetchModels}
          status={fetchStatus}
          t={t}
        />

        <PromptInputSelect
          defaultValue={selectedModel}
          open={isOpen}
          onOpenChange={handleOpenChange}
          onValueChange={handleValueChange}
          key={selectedModel || 'no-model-selected'} // eslint-disable-line typescript/prefer-nullish-coalescing -- empty model name should fall through
        >
          <PromptInputSelectTrigger
            aria-label={selectedModel || t('aiChat.ollama.selectModel')} // eslint-disable-line typescript/prefer-nullish-coalescing -- empty model name should fall through
            disabled={isTriggerDisabled}
            className={cn(
              'w-full border border-input bg-background px-3 py-2 text-sm shadow-sm',
              !hideFetchButton && !isCompactLayout && 'sm:w-[220px]',
            )}
          >
            <PromptInputSelectValue
              placeholder={t('aiChat.ollama.selectModel')}
            />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            <ModelOptions
              isLoading={isLoading}
              selectableModels={selectableModels}
              t={t}
            />
          </PromptInputSelectContent>
        </PromptInputSelect>
      </div>

      <SelectorMessage
        errorMessage={errorMessage}
        helperText={helperText}
        ollamaError={ollamaError}
        platform={platform}
      />
    </div>
  )
}

export type { OllamaModelOption }
export { OllamaModelSelector }
