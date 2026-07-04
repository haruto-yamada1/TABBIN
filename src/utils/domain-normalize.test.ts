import { describe, expect, it } from 'vitest'

import {
  domainMatches,
  hasNormalizedDomain,
  normalizeDomainLookupKey,
  toHostname,
} from './domain-normalize'

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

describe('toHostname', () => {
  it('URL から hostname を取り出す', () => {
    expect(toHostname('https://Example.com/path')).toBe('example.com')
  })

  it('http スキームも hostname を取り出す', () => {
    expect(toHostname('http://other.example.com')).toBe('other.example.com')
  })

  it('不正 URL は空文字列を返し例外を投げない', () => {
    expect(toHostname('not a url')).toBe('')
  })

  it('空文字列は空文字列を返す', () => {
    expect(toHostname('')).toBe('')
  })
})

describe('domainMatches', () => {
  it('スキーム付きと hostname は等価とみなす', () => {
    expect(domainMatches('https://example.com', 'example.com')).toBe(true)
  })

  it('大文字小文字差を吸収する', () => {
    expect(domainMatches('Example.COM', 'example.com')).toBe(true)
  })

  it('異なるドメインは false', () => {
    expect(domainMatches('a.example.com', 'b.example.com')).toBe(false)
  })
})

describe('hasNormalizedDomain', () => {
  it('配列中に等価なドメインがあれば true', () => {
    expect(
      hasNormalizedDomain(['https://example.com', 'other.com'], 'example.com'),
    ).toBe(true)
  })

  it('一致がなければ false', () => {
    expect(hasNormalizedDomain(['other.com'], 'example.com')).toBe(false)
  })

  it('空配列は false', () => {
    expect(hasNormalizedDomain([], 'example.com')).toBe(false)
  })
})
