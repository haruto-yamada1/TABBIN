import { describe, expect, it } from 'vitest'

import { getSupportedCodeLanguage } from './code-block'

describe('getSupportedCodeLanguage', () => {
  it('よく使う alias を最小サポート language に正規化する', () => {
    expect(getSupportedCodeLanguage('js')).toBe('javascript')
    expect(getSupportedCodeLanguage('ts')).toBe('typescript')
    expect(getSupportedCodeLanguage('yml')).toBe('yaml')
    expect(getSupportedCodeLanguage('sh')).toBe('bash')
  })

  it('サポート外 language は text として扱う', () => {
    expect(getSupportedCodeLanguage('emacs-lisp')).toBe('text')
    expect(getSupportedCodeLanguage('wolfram')).toBe('text')
    expect(getSupportedCodeLanguage('')).toBe('text')
  })
})
