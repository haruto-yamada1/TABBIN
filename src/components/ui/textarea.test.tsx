// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Textarea } from './textarea'

describe('Textareaコンポーネント', () => {
  it('aria-invalid=true のときエラー表示用クラスを持つ', () => {
    render(<Textarea aria-invalid aria-label='Invalid textarea' />)

    const textarea = screen.getByRole('textbox', { name: 'Invalid textarea' })
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(textarea.className).toContain('aria-invalid:border-destructive')
    expect(textarea.className).toContain('aria-invalid:ring-destructive/20')
    expect(textarea.className).toContain(
      'dark:aria-invalid:ring-destructive/40',
    )
  })
})
