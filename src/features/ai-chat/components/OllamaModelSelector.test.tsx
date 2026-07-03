// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

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
      <button onClick={() => onOpenChange?.(true)} type='button'>
        open-select
      </button>

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
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
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
    <option aria-label={value} value={value}>
      {children}
    </option>
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
        models={[]}
        onFetchModels={vi.fn()}
        onSelectModel={vi.fn()}
        status={{ isLoading: true }}
      />,
    )

    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.queryByText('Loading...')).toBeNull()
    expect(screen.queryByText('Loading model list...')).toBeNull()
  })

  it('fetches models when opening the select in fetchOnOpen mode', async () => {
    const user = userEvent.setup()
    const onFetchModels = vi.fn()

    render(
      <OllamaModelSelector
        behavior={{ fetchOnOpen: true }}
        models={[]}
        onFetchModels={onFetchModels}
        onSelectModel={vi.fn()}
        status={{ isLoading: false }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'open-select' }))

    expect(onFetchModels).toHaveBeenCalledTimes(1)
  })
})
