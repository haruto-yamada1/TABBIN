// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ToolOutput } from './tool'

afterEach(async () => {
  await act(async () => {
    cleanup()
  })
})

describe('ToolOutput', () => {
  it('長い英字と日本語の結果を折り返せるクラスで表示する', async () => {
    const english =
      'SuperLongEnglishWordWithoutNaturalBreakpointsThatShouldWrapInsideTheToolOutputPanel'
    const japanese =
      'これは実行ツールの出力で、十分に長い日本語の文章でも横にオーバーフローせず途中で改行される必要があります。'

    const { container } = render(
      <ToolOutput errorText='' output={`${english}\n${japanese}`} />,
    )

    const outputRoot = screen.getByText('Result').nextElementSibling
    const codeBlock = container.querySelector('[data-language="json"]')
    const pre = codeBlock?.querySelector('pre')

    await waitFor(() => {
      const hasHighlightedTokens = Array.from(
        pre?.querySelectorAll<HTMLSpanElement>('span') ?? [],
      ).some(
        (token) => token.style.color !== '' && token.style.color !== 'inherit',
      )
      expect(hasHighlightedTokens).toBe(true)
    })

    expect(outputRoot?.className).not.toContain('overflow-x-auto')
    expect(codeBlock?.className).toContain('overflow-hidden')
    expect(pre?.className).toContain('whitespace-pre-wrap')
    expect(pre?.className).toContain('wrap-anywhere')
    expect(pre?.textContent).toContain(english)
    expect(pre?.textContent).toContain(japanese)
  })
})
