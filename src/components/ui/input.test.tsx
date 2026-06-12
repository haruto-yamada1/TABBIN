// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Input } from './input'

describe('Inputコンポーネント', () => {
  it('aria-invalid=true のときエラー表示用クラスを持つ', () => {
    render(<Input aria-invalid aria-label='Invalid input' />)

    const input = screen.getByRole('textbox', { name: 'Invalid input' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.className).toContain('aria-invalid:border-destructive')
    expect(input.className).toContain('aria-invalid:ring-destructive/20')
    expect(input.className).toContain('dark:aria-invalid:ring-destructive/40')
  })

  it('追加クラスを維持したまま通常状態を描画する', () => {
    render(<Input aria-label='Default input' className='input-extra' />)

    const input = screen.getByRole('textbox', { name: 'Default input' })
    expect(input.className).toContain('input-extra')
    expect(input.className).toContain('border-input')
  })
})
