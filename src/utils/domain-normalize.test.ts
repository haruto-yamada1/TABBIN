import { describe, expect, it } from 'vitest'

import { normalizeDomainLookupKey } from './domain-normalize'

describe('normalizeDomainLookupKey', () => {
  it('スキームなし hostname は trim + 小文字化して返す', () => {
    expect(normalizeDomainLookupKey('  Example.COM  ')).toBe('example.com')
  })

  it('https スキーム付きは hostname を取り出す', () => {
    expect(normalizeDomainLookupKey('https://Example.com/path')).toBe(
      'example.com',
    )
  })

  it('http スキーム付きは hostname を取り出す', () => {
    expect(normalizeDomainLookupKey('http://other.com')).toBe('other.com')
  })

  it('スキーム付きと hostname は同じ key になる (形式差を吸収)', () => {
    expect(normalizeDomainLookupKey('https://example.com')).toBe(
      normalizeDomainLookupKey('example.com'),
    )
  })

  it('パース失敗形 (://invalid) は trim+小文字化をそのまま返す', () => {
    expect(normalizeDomainLookupKey('://Invalid')).toBe('://invalid')
  })

  it('空文字列は空文字列を返す', () => {
    expect(normalizeDomainLookupKey('')).toBe('')
  })
})
