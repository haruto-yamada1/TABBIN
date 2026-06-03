// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
  usePromptInputReferencedSources,
} from './prompt-input'

const createFile = (name = 'test.png', type = 'image/png') =>
  new File(['content'], name, { type })

const renderPromptInput = (
  onSubmit = vi.fn(),
  props: Record<string, unknown> = {},
) =>
  render(
    <PromptInput onSubmit={onSubmit} {...props}>
      <PromptInputBody>
        <PromptInputHeader />
        <PromptInputTextarea />
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit />
        </PromptInputFooter>
      </PromptInputBody>
    </PromptInput>,
  )

describe('PromptInput', () => {
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock')
    revokeObjectURLSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('テキスト入力と submit ボタンを描画する', () => {
    renderPromptInput()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('submit 時に入力テキストとファイルを onSubmit に渡す', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputBody>
          <PromptInputTextarea />
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>,
    )

    await user.type(screen.getByRole('textbox'), 'hello')
    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'hello', files: [] }),
        expect.anything(),
      )
    })
  })

  it('Enter キーで submit する', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderPromptInput(onSubmit)

    await user.type(screen.getByRole('textbox'), 'test{Enter}')

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled()
    })
  })

  it('Shift+Enter は submit しない（改行のみ）', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    renderPromptInput(onSubmit)

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'line1{Shift>}{Enter}{/Shift}')

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('IME 入力中は Enter で submit しない', () => {
    const onSubmit = vi.fn()

    renderPromptInput(onSubmit)

    const textarea = screen.getByRole('textbox')

    fireEvent.compositionStart(textarea)
    fireEvent.keyDown(textarea, {
      key: 'Enter',
      nativeEvent: { isComposing: true },
    })
    fireEvent.compositionEnd(textarea)

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('空入力で Backspace を押すと最後の添付ファイルを削除する', async () => {
    const onSubmit = vi.fn()

    render(
      <PromptInput onSubmit={onSubmit} maxFiles={5}>
        <PromptInputBody>
          <PromptInputTextarea />
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>,
    )

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = createFile()

    fireEvent.change(fileInput, { target: { files: [file] } })

    const textarea = screen.getByRole('textbox')
    fireEvent.keyDown(textarea, { key: 'Backspace' })

    expect(revokeObjectURLSpy).toHaveBeenCalled()
  })

  it('ファイルをペーストすると添付ファイルとして追加する', () => {
    const onSubmit = vi.fn()

    renderPromptInput(onSubmit)

    const textarea = screen.getByRole('textbox')
    const file = createFile('paste.png', 'image/png')
    const clipboardData = {
      items: [{ kind: 'file', getAsFile: () => file }],
      types: ['Files'],
    }

    fireEvent.paste(textarea, { clipboardData })

    expect(createObjectURLSpy).toHaveBeenCalled()
  })

  it('unmount 時にローカルの blob URL を revoke する', () => {
    const onSubmit = vi.fn()

    const { unmount } = renderPromptInput(onSubmit)

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file = createFile()

    fireEvent.change(fileInput, { target: { files: [file] } })

    unmount()

    expect(revokeObjectURLSpy).toHaveBeenCalled()
  })

  it('accept フィルターに合わないファイルは onError で通知する', () => {
    const onError = vi.fn()
    const onSubmit = vi.fn()

    render(
      <PromptInput accept='image/*' onError={onError} onSubmit={onSubmit}>
        <PromptInputBody>
          <PromptInputTextarea />
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>,
    )

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const textFile = new File(['content'], 'readme.txt', {
      type: 'text/plain',
    })

    fireEvent.change(fileInput, { target: { files: [textFile] } })

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'accept' }),
    )
  })

  it('maxFileSize を超えるファイルは onError で通知する', () => {
    const onError = vi.fn()
    const onSubmit = vi.fn()

    render(
      <PromptInput maxFileSize={10} onError={onError} onSubmit={onSubmit}>
        <PromptInputBody>
          <PromptInputTextarea />
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>,
    )

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const bigFile = new File([new ArrayBuffer(100)], 'big.png', {
      type: 'image/png',
    })

    fireEvent.change(fileInput, { target: { files: [bigFile] } })

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'max_file_size' }),
    )
  })

  it('maxFiles を超えると onError で通知する', () => {
    const onError = vi.fn()
    const onSubmit = vi.fn()

    render(
      <PromptInput maxFiles={1} onError={onError} onSubmit={onSubmit}>
        <PromptInputBody>
          <PromptInputTextarea />
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>,
    )

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const file1 = createFile('a.png')
    const file2 = createFile('b.png')

    fireEvent.change(fileInput, { target: { files: [file1, file2] } })

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'max_files' }),
    )
  })

  it('globalDrop が有効なとき document レベルでドロップを受け付ける', () => {
    const onSubmit = vi.fn()

    render(
      <PromptInput globalDrop onSubmit={onSubmit}>
        <PromptInputBody>
          <PromptInputTextarea />
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>,
    )

    const file = createFile()
    const dataTransfer = {
      files: [file],
      types: ['Files'],
    }

    fireEvent.drop(document, { dataTransfer })

    expect(createObjectURLSpy).toHaveBeenCalled()
  })

  it('PromptInputSubmit に status="streaming" を渡すと停止ボタンになる', () => {
    render(
      <PromptInput onSubmit={vi.fn()}>
        <PromptInputBody>
          <PromptInputTextarea />
          <PromptInputFooter>
            <PromptInputSubmit status='streaming' onStop={vi.fn()} />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>,
    )

    const button = screen.getByRole('button')
    expect(button.getAttribute('type')).toBe('button')
  })
})

describe('PromptInputProvider', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('子コンポーネントに attachments と textInput を提供する', () => {
    let attachments: ReturnType<typeof usePromptInputAttachments> | undefined
    let controller: ReturnType<typeof usePromptInputController> | undefined

    const Consumer = () => {
      attachments = usePromptInputAttachments()
      controller = usePromptInputController()
      return <span>consumer</span>
    }

    render(
      <PromptInputProvider>
        <Consumer />
      </PromptInputProvider>,
    )

    expect(attachments).toBeDefined()
    expect(controller).toBeDefined()
    expect(attachments?.files).toEqual([])
    expect(controller?.textInput.value).toBe('')
  })

  it('initialInput で初期テキストを設定できる', () => {
    let controller: ReturnType<typeof usePromptInputController> | undefined

    const Consumer = () => {
      controller = usePromptInputController()
      return <span>{controller?.textInput.value}</span>
    }

    render(
      <PromptInputProvider initialInput='hello'>
        <Consumer />
      </PromptInputProvider>,
    )

    expect(screen.getByText('hello')).toBeTruthy()
    expect(controller?.textInput.value).toBe('hello')
  })

  it('unmount 時に blob URL を revoke する', () => {
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')

    let addFn: ((files: File[] | FileList) => void) | undefined

    const Consumer = () => {
      const attachments = usePromptInputAttachments()
      addFn = attachments.add
      return <span>consumer</span>
    }

    const { unmount } = render(
      <PromptInputProvider>
        <Consumer />
      </PromptInputProvider>,
    )

    act(() => {
      addFn?.([createFile()])
    })

    unmount()

    expect(revokeSpy).toHaveBeenCalled()
  })
})

describe('context hooks', () => {
  afterEach(() => {
    cleanup()
  })

  it('usePromptInputController は Provider 外でエラーを投げる', () => {
    const Consumer = () => {
      usePromptInputController()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(/PromptInputProvider/)
  })

  it('usePromptInputReferencedSources は PromptInput 外でエラーを投げる', () => {
    const Consumer = () => {
      usePromptInputReferencedSources()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(/LocalReferencedSourcesContext/)
  })
})
