// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AnsiText } from './terminal'

describe('AnsiText', () => {
  afterEach(cleanup)

  it('ANSI の色と装飾を React の style として表示する', () => {
    const { container } = render(
      <AnsiText>{'\u001b[31;1merror\u001b[0m plain'}</AnsiText>,
    )

    const styledText = container.querySelector('span')

    expect(container.textContent).toBe('error plain')
    expect(styledText?.style.color).toBe('rgb(187, 0, 0)')
    expect(styledText?.style.fontWeight).toBe('bold')
  })

  it('URL や mailto 風の文字列をリンクに変換しない', () => {
    const { container } = render(
      <AnsiText>https://example.com mailto:security@example.com</AnsiText>,
    )

    expect(container.textContent).toBe(
      'https://example.com mailto:security@example.com',
    )
    expect(container.querySelector('a')).toBeNull()
  })

  it('backspace と carriage return を端末出力として反映する', () => {
    const { container } = render(
      <AnsiText>{'abc\b\bXY\nprogress 10%\rprogress 20%'}</AnsiText>,
    )

    expect(container.textContent).toBe('aXY\nprogress 20%')
  })
})
