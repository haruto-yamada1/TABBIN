import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { hasMermaidBlock, StreamdownMarkdown } from './streamdown-renderer'

afterEach(cleanup)

const hasHighlightedTokens = (code: Element | null) =>
  Array.from(code?.querySelectorAll<HTMLSpanElement>('span') ?? []).some(
    (token) => {
      const color = token.style.getPropertyValue('--sdm-c').trim()
      return color !== '' && color !== 'inherit'
    },
  )

describe('hasMermaidBlock', () => {
  it('mermaid fence がある Markdown だけを検出する', () => {
    expect(
      hasMermaidBlock(['```mermaid', 'graph LR', 'A --> B', '```'].join('\n')),
    ).toBe(true)
    expect(
      hasMermaidBlock(['```mmd', 'graph LR', 'A --> B', '```'].join('\n')),
    ).toBe(true)
    expect(
      hasMermaidBlock(['```typescript', 'const value = 1', '```'].join('\n')),
    ).toBe(false)
  })
})

describe('StreamdownMarkdown', () => {
  it('実際の Shiki plugin でコードを強調表示し、更新後の内容を描画する', async () => {
    const markdown = (value: number) =>
      ['```ts', `const upgradeValue = ${value}`, '```'].join('\n')
    const { container, rerender } = render(
      <StreamdownMarkdown mode='static'>{markdown(1)}</StreamdownMarkdown>,
    )

    await waitFor(() => {
      const code = container.querySelector('pre code')
      expect(code?.textContent).toContain('const upgradeValue = 1')
      expect(hasHighlightedTokens(code)).toBe(true)
    })

    rerender(
      <StreamdownMarkdown mode='static'>{markdown(2)}</StreamdownMarkdown>,
    )

    await waitFor(() => {
      const code = container.querySelector('pre code')
      expect(code?.textContent).toContain('const upgradeValue = 2')
      expect(code?.textContent).not.toContain('const upgradeValue = 1')
      expect(hasHighlightedTokens(code)).toBe(true)
    })
  })

  it('未対応言語のコードを HTML として実行せず、そのまま表示する', () => {
    const { container } = render(
      <StreamdownMarkdown mode='static'>
        {[
          '```unknown-language',
          '<script>alert("upgrade")</script>',
          '```',
        ].join('\n')}
      </StreamdownMarkdown>,
    )

    expect(container.querySelector('pre code')?.textContent).toContain(
      '<script>alert("upgrade")</script>',
    )
    expect(container.querySelector('script')).toBeNull()
  })
})
