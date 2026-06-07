// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import {
  VoiceSelectorAccent,
  VoiceSelectorAge,
  VoiceSelectorAttributes,
  VoiceSelectorBullet,
  VoiceSelectorDescription,
  VoiceSelectorGender,
  VoiceSelectorName,
  VoiceSelectorPreview,
  useVoiceSelector,
} from './voice-selector'

describe('VoiceSelectorGender', () => {
  afterEach(() => {
    cleanup()
  })

  it.each([
    ['male', 'svg'],
    ['female', 'svg'],
    ['transgender', 'svg'],
    ['androgyne', 'svg'],
    ['non-binary', 'svg'],
    ['intersex', 'svg'],
  ] as const)('value="%s" のときアイコンを表示する', (value, _tag) => { // eslint-disable-line
    const { container } = render(<VoiceSelectorGender value={value} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('value 未指定のときデフォルトアイコンを表示する', () => {
    const { container } = render(<VoiceSelectorGender />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('children が渡されると children を優先して表示する', () => {
    render(<VoiceSelectorGender value='male'>custom</VoiceSelectorGender>)
    expect(screen.getByText('custom')).toBeTruthy()
  })

  it('text-xs と text-muted-foreground のクラスを持つ', () => {
    const { container } = render(<VoiceSelectorGender value='male' />)
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-xs')
    expect(span?.className).toContain('text-muted-foreground')
  })
})

describe('VoiceSelectorAccent', () => {
  afterEach(() => {
    cleanup()
  })

  it.each([
    ['american', '🇺🇸'],
    ['british', '🇬🇧'],
    ['japanese', '🇯🇵'],
    ['french', '🇫🇷'],
    ['german', '🇩🇪'],
  ] as const)(
    'value="%s" のとき対応する国旗絵文字を表示する',
    (value, emoji) => { // eslint-disable-line
      render(<VoiceSelectorAccent value={value} />)
      expect(screen.getByText(emoji)).toBeTruthy()
    },
  )

  it('未知の value のとき絵文字を表示しない', () => {
    const { container } = render(<VoiceSelectorAccent value='unknown' />)
    const span = container.querySelector('span')
    expect(span?.textContent).toBe('')
  })

  it('children が渡されると children を優先して表示する', () => {
    render(<VoiceSelectorAccent value='american'>custom</VoiceSelectorAccent>)
    expect(screen.getByText('custom')).toBeTruthy()
  })
})

describe('VoiceSelectorAge', () => {
  afterEach(() => {
    cleanup()
  })

  it('tabular-nums クラスを持つ', () => {
    const { container } = render(<VoiceSelectorAge>25</VoiceSelectorAge>)
    const span = container.querySelector('span')
    expect(span?.className).toContain('tabular-nums')
    expect(span?.className).toContain('text-xs')
  })

  it('children を表示する', () => {
    render(<VoiceSelectorAge>30</VoiceSelectorAge>)
    expect(screen.getByText('30')).toBeTruthy()
  })
})

describe('VoiceSelectorName', () => {
  afterEach(() => {
    cleanup()
  })

  it('truncate と font-medium のクラスを持つ', () => {
    const { container } = render(
      <VoiceSelectorName>Test Voice</VoiceSelectorName>,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('truncate')
    expect(span?.className).toContain('font-medium')
    expect(span?.className).toContain('flex-1')
  })

  it('children を表示する', () => {
    render(<VoiceSelectorName>My Voice</VoiceSelectorName>)
    expect(screen.getByText('My Voice')).toBeTruthy()
  })
})

describe('VoiceSelectorDescription', () => {
  afterEach(() => {
    cleanup()
  })

  it('text-xs と text-muted-foreground のクラスを持つ', () => {
    const { container } = render(
      <VoiceSelectorDescription>A warm voice</VoiceSelectorDescription>,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-xs')
    expect(span?.className).toContain('text-muted-foreground')
  })
})

describe('VoiceSelectorAttributes', () => {
  afterEach(() => {
    cleanup()
  })

  it('flex items-center のクラスを持つ', () => {
    const { container } = render(
      <VoiceSelectorAttributes>attrs</VoiceSelectorAttributes>,
    )
    const div = container.querySelector('div')
    expect(div?.className).toContain('flex')
    expect(div?.className).toContain('items-center')
  })
})

describe('VoiceSelectorBullet', () => {
  afterEach(() => {
    cleanup()
  })

  it('aria-hidden="true" で区切り文字を表示する', () => {
    const { container } = render(<VoiceSelectorBullet />)
    const span = container.querySelector('span')
    expect(span?.getAttribute('aria-hidden')).toBe('true')
    expect(span?.textContent).toContain('•')
  })
})

describe('VoiceSelectorPreview', () => {
  afterEach(() => {
    cleanup()
  })

  it('再生アイコンのボタンを描画する', () => {
    render(<VoiceSelectorPreview />)
    const button = screen.getByRole('button')
    expect(button).toBeTruthy()
    expect(button.getAttribute('type')).toBe('button')
  })

  it('playing=true のとき一時停止アイコンになる', () => {
    render(<VoiceSelectorPreview playing />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')?.toLowerCase()).toContain('pause')
  })

  it('loading=true のときボタンが disabled になる', () => {
    render(<VoiceSelectorPreview loading />)
    const button = screen.getByRole('button')
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('クリック時に onPlay を呼び出す', () => {
    const onPlay = vi.fn()
    render(<VoiceSelectorPreview onPlay={onPlay} />)
    screen.getByRole('button').click()
    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})

describe('useVoiceSelector', () => {
  afterEach(() => {
    cleanup()
  })

  it('VoiceSelector 外で使用するとエラーを投げる', () => {
    const Consumer = () => {
      useVoiceSelector()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(/VoiceSelector/)
  })
})
