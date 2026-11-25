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

  it('restores a visible focus outline under forced colors', () => {
    const css = readFileSync(resolve(__dirname, '../assets/global.css'), 'utf8')

    // The usual focus ring is a box-shadow, which forced-colors mode strips.
    expect(css).toMatch(
      /@media \(forced-colors: active\)\s*\{[^}]*:focus-visible\s*\{[^}]*outline:\s*2px solid Highlight/s,
    )
  })
})
