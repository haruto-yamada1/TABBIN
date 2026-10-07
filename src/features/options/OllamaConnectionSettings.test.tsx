// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Select } from '@/components/ui/select'
import { getMessages } from '@/features/i18n/messages'

import { OllamaConnectionSettings } from './OllamaConnectionSettings'

const connectionMocks = vi.hoisted(() => ({
  language: 'en',
  onValueChange: undefined as ((value: string) => void) | undefined,
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = getMessages(
        connectionMocks.language === 'ja' ? 'ja' : 'en',
      )
      return messages[key] ?? key
    },
  }),
}))

vi.mock('@/components/ui/select', async () => {
  // eslint-disable-next-line typescript/consistent-type-imports
  const actual = await vi.importActual<typeof import('@/components/ui/select')>(
    '@/components/ui/select',
  )

  return {
    ...actual,
    Select: (props: ComponentProps<typeof Select>) => {
      connectionMocks.onValueChange = props.onValueChange
      return <actual.Select {...props} />
    },
  }
})

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)

describe('OllamaConnectionSettings', () => {
  beforeEach(() => {
    connectionMocks.language = 'en'
    connectionMocks.onValueChange = undefined
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
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

  it('欠損した設定を localhost として表示し、説明をコントロールへ関連付ける', () => {
    render(
      <OllamaConnectionSettings
        baseUrl={undefined}
        onBaseUrlChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Ollama connection' }),
    ).toBeTruthy()
    const selector = screen.getByRole('combobox', {
      name: 'Ollama connection URL',
    })
    expect(selector).toHaveTextContent('http://localhost:11434')
    expect(selector).toHaveAccessibleDescription(
      'Choose the local Ollama address. If localhost does not connect, try 127.0.0.1. Changes are saved automatically and used for model loading and chat.',
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('保存された IP 接続先を日本語のカードに表示する', () => {
    connectionMocks.language = 'ja'
    render(
      <OllamaConnectionSettings
        baseUrl='http://127.0.0.1:11434'
        onBaseUrlChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Ollama 接続設定' }),
    ).toBeTruthy()
    const selector = screen.getByRole('combobox', {
      name: 'Ollama の接続先 URL',
    })
    expect(selector).toHaveTextContent('http://127.0.0.1:11434')
    expect(selector).toHaveAccessibleDescription(
      'ローカルの Ollama の接続先を選択します。localhost で接続できない場合は 127.0.0.1 をお試しください。変更は自動保存され、モデルの読み込みとチャットに使用されます。',
    )
  })

  it('2 つのローカル URL だけを選択肢として表示し、変更を通知する', async () => {
    const user = userEvent.setup()
    const onBaseUrlChange = vi.fn()
    render(
      <OllamaConnectionSettings
        baseUrl={undefined}
        onBaseUrlChange={onBaseUrlChange}
      />,
    )

    await user.tab()
    await user.keyboard('{Enter}')

    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(
      screen.getByRole('option', { name: 'http://localhost:11434' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('option', { name: 'http://127.0.0.1:11434' }),
    ).toBeTruthy()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onBaseUrlChange).toHaveBeenCalledWith('http://127.0.0.1:11434')
  })

  it('Select の境界から許可外 URL が渡されても保存コールバックへ渡さない', () => {
    const onBaseUrlChange = vi.fn()
    render(
      <OllamaConnectionSettings
        baseUrl={undefined}
        onBaseUrlChange={onBaseUrlChange}
      />,
    )

    act(() => {
      connectionMocks.onValueChange?.('https://remote.example:11434')
      connectionMocks.onValueChange?.('http://localhost:11434/')
      connectionMocks.onValueChange?.('')
    })
    expect(onBaseUrlChange).not.toHaveBeenCalled()

    act(() => {
      connectionMocks.onValueChange?.('http://localhost:11434')
    })
    expect(onBaseUrlChange).toHaveBeenCalledWith('http://localhost:11434')
  })
})
