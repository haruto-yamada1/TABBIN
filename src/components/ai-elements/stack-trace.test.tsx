// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  StackTrace,
  StackTraceActions,
  StackTraceContent,
  StackTraceCopyButton,
  StackTraceError,
  StackTraceErrorMessage,
  StackTraceErrorType,
  StackTraceExpandButton,
  StackTraceFrames,
  StackTraceHeader,
} from './stack-trace'

const sampleTrace = `TypeError: Cannot read properties of undefined (reading 'map')
    at renderList (src/components/List.tsx:42:15)
    at processItems (src/utils/process.ts:10:5)
    at Object.<anonymous> (node_modules/some-lib/index.js:100:3)`

const renderFullStackTrace = (trace = sampleTrace, props = {}) =>
  render(
    <StackTrace trace={trace} defaultOpen {...props}>
      <StackTraceHeader>
        <StackTraceError>
          <StackTraceErrorType />
          <StackTraceErrorMessage />
        </StackTraceError>
        <StackTraceActions>
          <StackTraceCopyButton />
          <StackTraceExpandButton />
        </StackTraceActions>
      </StackTraceHeader>
      <StackTraceContent>
        <StackTraceFrames />
      </StackTraceContent>
    </StackTrace>,
  )

describe('StackTrace', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('エラータイプとメッセージを表示する', () => {
    renderFullStackTrace()

    expect(screen.getByText('TypeError')).toBeTruthy()
    expect(
      screen.getByText("Cannot read properties of undefined (reading 'map')"),
    ).toBeTruthy()
  })

  it('スタックフレームの関数名とファイルパスを表示する', () => {
    renderFullStackTrace()

    expect(screen.getByText('renderList')).toBeTruthy()
    expect(screen.getByText(/List\.tsx:42:15/)).toBeTruthy()
  })

  it('内部フレーム（node_modules）を識別する', () => {
    const { container } = renderFullStackTrace()

    const internalFrames = container.querySelectorAll(
      String.raw`.text-muted-foreground\/50`,
    )
    expect(internalFrames.length).toBeGreaterThan(0)
  })

  it('showInternalFrames=false で内部フレームを非表示にする', () => {
    render(
      <StackTrace trace={sampleTrace} defaultOpen>
        <StackTraceHeader>
          <StackTraceError>
            <StackTraceErrorType />
            <StackTraceErrorMessage />
          </StackTraceError>
        </StackTraceHeader>
        <StackTraceContent>
          <StackTraceFrames showInternalFrames={false} />
        </StackTraceContent>
      </StackTrace>,
    )

    expect(screen.queryByText(/some-lib/)).toBeNull()
    expect(screen.getByText('renderList')).toBeTruthy()
  })

  it('エラーメッセージだけのトレースを表示する', () => {
    const simpleTrace = 'Error: something went wrong'
    renderFullStackTrace(simpleTrace)

    expect(screen.getByText('Error')).toBeTruthy()
    expect(screen.getByText('something went wrong')).toBeTruthy()
  })

  it('フレームのないトレースでメッセージを表示する', () => {
    render(
      <StackTrace trace='plain text without stack' defaultOpen>
        <StackTraceHeader>
          <StackTraceError>
            <StackTraceErrorType />
            <StackTraceErrorMessage />
          </StackTraceError>
        </StackTraceHeader>
        <StackTraceContent>
          <StackTraceFrames />
        </StackTraceContent>
      </StackTrace>,
    )

    expect(screen.getByText('plain text without stack')).toBeTruthy()
  })
})

describe('StackTraceCopyButton', () => {
  let writeTextMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('クリック時にクリップボードにトレースをコピーする', async () => {
    renderFullStackTrace()

    const copyButtons = screen.getAllByRole('button')
    const copyButton =
      copyButtons.find(
        (b) => b.querySelector('svg') && b.getAttribute('type') !== 'button',
      ) ?? copyButtons[0]

    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(sampleTrace)
    })
  })

  it('コピー後に onCopy コールバックを呼び出す', async () => {
    const onCopy = vi.fn()

    render(
      <StackTrace trace={sampleTrace} defaultOpen>
        <StackTraceHeader>
          <StackTraceActions>
            <StackTraceCopyButton onCopy={onCopy} />
          </StackTraceActions>
        </StackTraceHeader>
      </StackTrace>,
    )

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])

    await waitFor(() => {
      expect(onCopy).toHaveBeenCalled()
    })
  })
})

describe('StackTraceExpandButton', () => {
  afterEach(() => {
    cleanup()
  })

  it('開いた状態で rotate-180 クラスを持つ', () => {
    const { container } = render(
      <StackTrace trace={sampleTrace} defaultOpen>
        <StackTraceHeader>
          <StackTraceExpandButton />
        </StackTraceHeader>
      </StackTrace>,
    )

    const chevron = container.querySelector('.rotate-180')
    expect(chevron).toBeTruthy()
  })

  it('閉じた状態で rotate-0 クラスを持つ', () => {
    const { container } = render(
      <StackTrace trace={sampleTrace} defaultOpen={false}>
        <StackTraceHeader>
          <StackTraceExpandButton />
        </StackTraceHeader>
      </StackTrace>,
    )

    const chevron = container.querySelector('.rotate-0')
    expect(chevron).toBeTruthy()
  })
})

describe('StackTraceActions', () => {
  afterEach(() => {
    cleanup()
  })

  it('クリックイベントの伝播を停止する', () => {
    const parentClick = vi.fn()

    render(
      <div role='presentation' onClick={parentClick} onKeyDown={() => {}}>
        <StackTraceActions>
          <button type='button'>action</button>
        </StackTraceActions>
      </div>,
    )

    fireEvent.click(screen.getByText('action'))
    expect(parentClick).not.toHaveBeenCalled()
  })
})

describe('StackTraceError', () => {
  afterEach(() => {
    cleanup()
  })

  it('AlertTriangle アイコンを表示する', () => {
    const { container } = render(
      <StackTraceError>error content</StackTraceError>,
    )

    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('error content')).toBeTruthy()
  })
})
