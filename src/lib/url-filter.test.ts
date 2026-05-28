import { describe, expect, it } from 'vitest'

import {
  filterItemsBySavableUrl,
  isSavableUrl,
  isUrlExcludedByPatterns,
  isValidUrl,
  normalizeUrlCandidate,
} from './url-filter'

describe('url-filter', () => {
  it('URL 候補を正規化し、不正値と空文字を除外する', () => {
    expect(normalizeUrlCandidate(' https://example.com/a ')).toBe(
      'https://example.com/a',
    )
    expect(normalizeUrlCandidate('   ')).toBeNull()
    expect(normalizeUrlCandidate(null)).toBeNull()
    expect(normalizeUrlCandidate(undefined)).toBeNull()
  })

  it('URL と除外パターンを判定する', () => {
    expect(isValidUrl('https://example.com/a')).toBe(true)
    expect(isValidUrl('not a url')).toBe(false)
    expect(isValidUrl(null)).toBe(false)

    expect(
      isUrlExcludedByPatterns('https://example.com/private', [
        '',
        ' private ',
        123 as unknown as string,
      ]),
    ).toBe(true)
    expect(isUrlExcludedByPatterns(undefined, ['example'])).toBe(false)
  })

  it('保存可能な URL だけを抽出する', () => {
    expect(isSavableUrl('https://example.com/a', [])).toBe(true)
    expect(isSavableUrl('file:///tmp/example.txt', [])).toBe(true)
    expect(isSavableUrl('about:blank', [])).toBe(true)
    expect(isSavableUrl('https://example.com/private', ['private'])).toBe(false)
    expect(isSavableUrl('   ', [])).toBe(false)

    expect(
      filterItemsBySavableUrl(
        [
          { id: 'valid', url: 'https://example.com/a' },
          { id: 'file', url: 'file:///tmp/example.txt' },
          { id: 'about', url: 'about:blank' },
          { id: 'excluded', url: 'https://example.com/private' },
          { id: 'missing' },
          { id: 'invalid', url: 'not a url' },
        ],
        ['private'],
      ),
    ).toEqual([
      { id: 'valid', url: 'https://example.com/a' },
      { id: 'file', url: 'file:///tmp/example.txt' },
      { id: 'about', url: 'about:blank' },
    ])
  })
})
