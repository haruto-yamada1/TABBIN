// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './badge'

describe('Badgeコンポーネント', () => {
  it('デフォルトは div として描画する', () => {
    render(<Badge className='badge-extra'>Default Badge</Badge>)

    const badge = screen.getByText('Default Badge')
    expect(badge.tagName).toBe('DIV')
    expect(badge.className).toContain('badge-extra')
    expect(badge.className).toContain('inline-flex')
  })

  it('variant と className を結合して描画する', () => {
    render(
      <Badge className='outline-extra' variant='outline'>
        Outline Badge
      </Badge>,
    )

    const badge = screen.getByText('Outline Badge')
    expect(badge.className).toContain('outline-extra')
    expect(badge.className).toContain('text-foreground')
  })
})
