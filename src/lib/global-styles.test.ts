import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('global styles font scaling', () => {
  it('applies app font scale to the html root so rem-based text utilities resize', () => {
    const css = readFileSync(resolve(__dirname, '../assets/global.css'), 'utf8')

    expect(css).toMatch(
      /html\s*\{[^}]*font-size:\s*calc\(16px \* var\(--app-font-scale\)\)/s,
    )
  })
})
