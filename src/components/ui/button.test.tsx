// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

describe('Buttonコンポーネント', () => {
  it('デフォルトでネイティブの button 要素を描画する', () => {
    render(<Button>Default Button</Button>)

    const button = screen.getByRole('button', { name: 'Default Button' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.className).toContain('inline-flex')
    expect(button.className).toContain('cursor-pointer')
    expect(button.className).toContain('bg-primary')
  })

  it('asChild が true のとき子要素を描画する', () => {
    render(
      <Button asChild>
        <a href='/docs'>Read Docs</a>
      </Button>,
    )

    const link = screen.getByRole('link', { name: 'Read Docs' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/docs')
    expect(link.className).toContain('inline-flex')
  })
})
