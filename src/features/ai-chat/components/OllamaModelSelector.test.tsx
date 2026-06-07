// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
  } & Record<string, unknown>) => (
    <button onClick={onClick} type='button' {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ai-elements/prompt-input', () => ({
  PromptInputSelect: ({
    children,
    onOpenChange,
    onValueChange,
  }: {
    children: React.ReactNode
    onOpenChange?: (open: boolean) => void
    onValueChange?: (value: string) => void
  }) => (
    <div>
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      <button onClick={() => onOpenChange?.(true)} type='button'>
        open-select
      </button>
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      <button onClick={() => onValueChange?.('llama3.2')} type='button'>
        select-model
      </button>
      {children}
    </div>
  ),
  PromptInputSelectTrigger: ({
    children,
    ...props
  }: {
    children: React.ReactNode
  } & Record<string, unknown>) => (
    <button
      aria-controls='ollama-model-selector-options'
      aria-expanded={false}
      role='combobox'
      type='button'
      {...props}
    >
      {children}
    </button>
  ),
  PromptInputSelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  PromptInputSelectContent: ({ children }: { children: React.ReactNode }) => (
    <div id='ollama-model-selector-options'>{children}</div>
  ),
  PromptInputSelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => (
    <div aria-label={value} aria-selected={false} role='option' tabIndex={-1}>
      {children}
    </div>
  ),
}))

vi.mock('@/features/ai-chat/components/OllamaErrorNotice', () => ({
  OllamaErrorNotice: () => <div>ollama-error</div>,
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      (
        ({
          'aiChat.ollama.loadModels': 'Load models',
          'aiChat.ollama.loading': 'Loading...',
          'aiChat.ollama.loadingModelList': 'Loading model list...',
          'aiChat.ollama.noModelsFound': 'No models found',
          'aiChat.ollama.selectModel': 'Select a model',
          'common.loadingLabel': 'Loading',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

import { OllamaModelSelector } from './OllamaModelSelector'

describe('OllamaModelSelector', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders spinner-only loading UI in the fetch button and empty option row', () => {
    render(
      <OllamaModelSelector
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
        models={[]}
        onFetchModels={vi.fn()}
        onSelectModel={vi.fn()}
// eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        status={{ isLoading: true }}
      />,
    )

    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.queryByText('Loading...')).toBeNull()
    expect(screen.queryByText('Loading model list...')).toBeNull()
  })

  it('fetches models when opening the select in fetchOnOpen mode', () => {
    const onFetchModels = vi.fn()

    render(
      <OllamaModelSelector
// eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        behavior={{ fetchOnOpen: true }}
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
        models={[]}
        onFetchModels={onFetchModels}
        onSelectModel={vi.fn()}
// eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        status={{ isLoading: false }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'open-select' }))

    expect(onFetchModels).toHaveBeenCalledTimes(1)
  })
})
