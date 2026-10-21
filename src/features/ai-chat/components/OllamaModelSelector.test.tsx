// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)

describe('OllamaModelSelector', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    if (originalScrollIntoView) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollIntoView',
        originalScrollIntoView,
      )
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })

  it('renders spinner-only loading UI in the fetch button and empty option row', async () => {
    const user = userEvent.setup()
    render(
      <OllamaModelSelector
        behavior={{ fetchOnOpen: true }}
        models={[]}
        onFetchModels={vi.fn()}
        onSelectModel={vi.fn()}
        status={{ isLoading: true }}
      />,
    )

    await user.tab()
    await user.keyboard('{Enter}')

    expect(screen.getAllByRole('status', { hidden: true })).toHaveLength(2)
    expect(screen.queryByText('Loading...')).toBeNull()
    expect(screen.queryByText('Loading model list...')).toBeNull()
  })

  it('fetches models when opening the select in fetchOnOpen mode', async () => {
    const user = userEvent.setup()
    const onFetchModels = vi.fn()

    render(
      <OllamaModelSelector
        behavior={{ fetchOnOpen: true, hideFetchButton: true }}
        models={[]}
        onFetchModels={onFetchModels}
        onSelectModel={vi.fn()}
        status={{ isLoading: false }}
      />,
    )

    await user.tab()
    await user.keyboard('{Enter}')

    expect(onFetchModels).toHaveBeenCalledTimes(1)
  })

  it('shows only installed models when the saved selection has been deleted', async () => {
    const user = userEvent.setup()
    render(
      <OllamaModelSelector
        behavior={{ fetchOnOpen: true, hideFetchButton: true }}
        models={[{ label: 'Qwen (0.8B)', name: 'qwen3.5:0.8b' }]}
        onFetchModels={vi.fn()}
        onSelectModel={vi.fn()}
        selectedModel='deleted-model:latest'
        status={{ isLoading: false }}
      />,
    )

    expect(screen.getByRole('combobox')).toHaveAccessibleName('Select a model')
    expect(screen.getByRole('combobox')).toHaveTextContent('Select a model')
    await user.tab()
    await user.keyboard('{Enter}')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'Qwen (0.8B)' })).toBeVisible()
    expect(screen.queryByText('deleted-model:latest')).toBeNull()
  })

  it('clears the displayed selection when refreshing removes the selected model', async () => {
    const user = userEvent.setup()
    const onSelectModel = vi.fn()
    const props = {
      behavior: { fetchOnOpen: true, hideFetchButton: true },
      onFetchModels: vi.fn(),
      onSelectModel,
      selectedModel: 'llama3.2',
      status: { isLoading: false },
    }
    const { rerender } = render(
      <OllamaModelSelector
        {...props}
        models={[{ label: 'Llama 3.2', name: 'llama3.2' }]}
      />,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Llama 3.2')

    rerender(
      <OllamaModelSelector
        {...props}
        models={[{ label: 'Qwen (0.8B)', name: 'qwen3.5:0.8b' }]}
      />,
    )

    expect(screen.getByRole('combobox')).toHaveAccessibleName('Select a model')
    expect(screen.getByRole('combobox')).toHaveTextContent('Select a model')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('option', { name: 'Llama 3.2' })).toBeNull()
    await user.keyboard('{Enter}')
    expect(onSelectModel).toHaveBeenCalledWith('qwen3.5:0.8b')
  })

  it('shows an empty list instead of a deleted saved selection', async () => {
    const user = userEvent.setup()
    render(
      <OllamaModelSelector
        behavior={{ fetchOnOpen: true, hideFetchButton: true }}
        models={[]}
        onFetchModels={vi.fn()}
        onSelectModel={vi.fn()}
        selectedModel='deleted-model:latest'
        status={{ isLoading: false }}
      />,
    )

    await user.tab()
    await user.keyboard('{Enter}')

    expect(
      screen.getByRole('option', { name: 'No models found' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('deleted-model:latest')).toBeNull()
  })
})
