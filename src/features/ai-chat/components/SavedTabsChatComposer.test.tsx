// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const mocked = vi.hoisted(() => ({
  promptInputErrorHandler: undefined as
    | ((error: {
        code: 'accept' | 'max_files' | 'max_file_size'
        message: string
      }) => void)
    | undefined,
}))

vi.mock('@/components/ai-elements/prompt-input', async () => {
  const actual = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/components/ai-elements/prompt-input')
  >('@/components/ai-elements/prompt-input')

  return {
    ...actual,
    PromptInput: (props: React.ComponentProps<typeof actual.PromptInput>) => {
      mocked.promptInputErrorHandler = props.onError
      return <actual.PromptInput {...props} />
    },
  }
})

vi.mock('@/features/ai-chat/components/OllamaModelSelector', () => ({
  OllamaModelSelector: ({
    layout,
    onFetchModels,
    onSelectModel,
    status,
  }: {
    layout: string
    onFetchModels: () => void
    onSelectModel: (modelName: string) => Promise<boolean>
    status: { isLoading: boolean; isSaving: boolean }
  }) => (
    <div
      data-layout={layout}
      data-loading={String(status.isLoading)}
      data-saving={String(status.isSaving)}
      data-testid='model-selector'
    >
      <button onClick={onFetchModels} type='button'>
        Fetch models
      </button>
      <button
        onClick={() => {
          void onSelectModel('llama3.2')
        }}
        type='button'
      >
        Select llama3.2
      </button>
    </div>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      (
        ({
          'aiChat.inputLabel': 'Ask AI',
          'aiChat.inputPlaceholder': 'Ask about saved tabs',
          'aiChat.inputPlaceholderSelectModel': 'Select a model first',
          'aiChat.send': 'Send',
          'aiChat.sending': 'Sending...',
          'common.submit': 'Submit',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

import { SavedTabsChatComposer } from './SavedTabsChatComposer'

const createProps = () => ({
  input: 'first',
  modelName: 'llama3.2',
  modelOptions: [{ label: 'llama3.2 (8B)', name: 'llama3.2' }],
  onAttachmentError: vi.fn(),
  onFetchModels: vi.fn(),
  onInputChange: vi.fn(),
  onSelectModel: vi.fn().mockResolvedValue(true),
  onSubmit: vi.fn(),
  platform: 'mac' as const,
  presentation: { isCompactLayout: false },
  setupErrorMessage: '',
  status: {
    isConfigured: true,
    isLoadingModels: false,
    isSavingModel: false,
    isSubmitting: false,
  },
})

describe('SavedTabsChatComposer', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    mocked.promptInputErrorHandler = undefined
  })

  it('forwards controlled input changes and inserts a newline on Enter', () => {
    const props = createProps()
    render(<SavedTabsChatComposer {...props} />)

    const textarea = screen.getByRole('textbox', {
      name: 'Ask AI',
    }) as HTMLTextAreaElement
    // Controlled input wiring is asserted without changing the fixture value.
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(textarea, { target: { value: 'changed' } })
    expect(props.onInputChange).toHaveBeenCalledWith('changed')

    props.onInputChange.mockClear()
    textarea.focus()
    textarea.setSelectionRange(5, 5)
    // The caret position must be set before the synthetic Enter event.
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(props.onInputChange).toHaveBeenCalledWith('first\n')
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('submits the prompt on Ctrl+Enter', async () => {
    const user = userEvent.setup()
    const props = createProps()
    render(<SavedTabsChatComposer {...props} />)

    const textarea = screen.getByRole('textbox', { name: 'Ask AI' })
    textarea.focus()
    await user.keyboard('{Control>}{Enter}{/Control}')

    await waitFor(() => {
      expect(props.onSubmit).toHaveBeenCalledTimes(1)
    })
  })

  it('forwards attachment input errors without owning browser or storage behavior', () => {
    const props = createProps()
    render(<SavedTabsChatComposer {...props} />)

    const error = {
      code: 'max_files' as const,
      message: 'Too many files',
    }
    mocked.promptInputErrorHandler?.(error)

    expect(props.onAttachmentError).toHaveBeenCalledWith(error)
  })

  it('forwards model fetch and selection and exposes selector status', async () => {
    const user = userEvent.setup()
    const props = createProps()
    render(
      <SavedTabsChatComposer
        {...props}
        status={{
          ...props.status,
          isLoadingModels: true,
          isSavingModel: true,
        }}
      />,
    )

    const selector = screen.getByTestId('model-selector')
    expect(selector).toHaveAttribute('data-loading', 'true')
    expect(selector).toHaveAttribute('data-saving', 'true')

    await user.click(screen.getByRole('button', { name: 'Fetch models' }))
    await user.click(screen.getByRole('button', { name: 'Select llama3.2' }))

    expect(props.onFetchModels).toHaveBeenCalledTimes(1)
    expect(props.onSelectModel).toHaveBeenCalledWith('llama3.2')
  })

  it.each([
    ['unconfigured', { isConfigured: false }],
    ['submitting', { isSubmitting: true }],
    ['saving model', { isSavingModel: true }],
  ])('disables submit while %s', (_, statusOverride) => {
    const props = createProps()
    render(
      <SavedTabsChatComposer
        {...props}
        status={{ ...props.status, ...statusOverride }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('disables blank input and renders compact submit labels', () => {
    const props = createProps()
    const { rerender } = render(
      <SavedTabsChatComposer {...props} input='   ' />,
    )

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()

    rerender(
      <SavedTabsChatComposer
        {...props}
        presentation={{ isCompactLayout: true }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass('w-full')
    expect(screen.getByTestId('model-selector')).toHaveAttribute(
      'data-layout',
      'compact',
    )

    rerender(
      <SavedTabsChatComposer
        {...props}
        presentation={{ isCompactLayout: true }}
        status={{ ...props.status, isSubmitting: true }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled()
  })
})
