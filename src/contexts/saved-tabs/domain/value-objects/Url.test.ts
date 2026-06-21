import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

import { createUrl, equalsUrl, urlToString } from './Url'

describe('Url 値オブジェクト', () => {
  it('正常な URL からは値オブジェクトを生成できる', () => {
    const url = createUrl('https://example.com/docs')
    expect(urlToString(url)).toBe('https://example.com/docs')
  })

  it('空文字列は INVALID_URL で拒否する', () => {
    const error = collectThrownError(() => createUrl(''))
    expect(error).toBeInstanceOf(SavedTabsDomainError)
    expect((error as SavedTabsDomainError).code).toBe('INVALID_URL')
  })

  it('空白だけの文字列も INVALID_URL で拒否する', () => {
    expect(() => createUrl('   ')).toThrow(SavedTabsDomainError)
  })

  it('URL としてパースできない文字列は INVALID_URL で拒否する', () => {
    expect(() => createUrl('not-a-url')).toThrow(SavedTabsDomainError)
  })

  it('同じ URL は equalsUrl で true、異なる URL は false', () => {
    const a = createUrl('https://example.com/a')
    const b = createUrl('https://example.com/a')
    const c = createUrl('https://example.com/b')
    expect(equalsUrl(a, b)).toBe(true)
    expect(equalsUrl(a, c)).toBe(false)
  })
})

const collectThrownError = (operation: () => unknown): unknown => {
  try {
    operation()
  } catch (error) {
    return error
  }
  return undefined
}
