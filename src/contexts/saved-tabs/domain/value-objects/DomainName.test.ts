import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

import {
  createDomainName,
  domainNameToString,
  equalsDomainName,
  normalizeDomainString,
} from './DomainName'

describe('DomainName 値オブジェクト', () => {
  it('正常なホスト名は小文字に正規化して保持する', () => {
    const domain = createDomainName('Example.COM')
    expect(domainNameToString(domain)).toBe('example.com')
  })

  it('前後の空白は trim する', () => {
    const domain = createDomainName('  example.com  ')
    expect(domainNameToString(domain)).toBe('example.com')
  })

  it('空文字列は INVALID_DOMAIN_NAME で拒否する', () => {
    expect(() => createDomainName('')).toThrow(SavedTabsDomainError)
  })

  it('スキーム付き文字列は拒否する', () => {
    expect(() => createDomainName('https://example.com')).toThrow(
      SavedTabsDomainError,
    )
  })

  it('同じドメイン名は equalsDomainName で true', () => {
    expect(
      equalsDomainName(createDomainName('a.com'), createDomainName('A.com')),
    ).toBe(true)
  })
})

describe('normalizeDomainString', () => {
  it('スキームが無い場合は入力をそのまま返す', () => {
    expect(normalizeDomainString('example.com')).toBe('example.com')
  })

  it('https スキーム付き文字列から hostname を取り出す', () => {
    expect(normalizeDomainString('https://example.com')).toBe('example.com')
  })

  it('http スキーム付き文字列から hostname を取り出す', () => {
    expect(normalizeDomainString('http://example.com/path')).toBe('example.com')
  })

  it('パース失敗時は入力をそのまま返す', () => {
    expect(normalizeDomainString('://invalid')).toBe('://invalid')
  })

  it('normalizeDomainString 経由なら createDomainName は例外を投げない', () => {
    expect(() =>
      createDomainName(normalizeDomainString('https://example.com')),
    ).not.toThrow()
  })
})
