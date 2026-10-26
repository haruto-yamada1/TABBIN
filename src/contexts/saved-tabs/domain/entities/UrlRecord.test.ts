import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

import { createUrlRecord, isSameUrlRecord } from './UrlRecord'

const baseInput = {
  id: 'record-1',
  url: 'https://example.com',
  title: 'Example',
  savedAt: 1_700_000_000_000,
}

describe('UrlRecord entity', () => {
  it('お気に入り属性を保持し、省略時は既存レコードと互換を保つ', () => {
    expect(createUrlRecord({ ...baseInput, isFavorite: true })).toEqual(
      expect.objectContaining({ isFavorite: true }),
    )
    expect(createUrlRecord(baseInput)).not.toHaveProperty('isFavorite')
  })

  it('正常な入力からエンティティを生成できる', () => {
    const record = createUrlRecord(baseInput)
    expect(record.id).toBe('record-1')
    expect(record.url).toBe('https://example.com')
    expect(record.title).toBe('Example')
    expect(record.savedAt).toBe(1_700_000_000_000)
    expect(record.favIconUrl).toBeUndefined()
    expect(Object.hasOwn(record, 'favIconUrl')).toBe(false)
  })

  it('rejects a malformed favorite flag', () => {
    const input = { ...baseInput, isFavorite: true }
    Object.defineProperty(input, 'isFavorite', { value: 'true' })
    expect(() => createUrlRecord(input)).toThrow(SavedTabsDomainError)
  })

  it('title が空文字列でも許容する（タイトル未取得ケース）', () => {
    const record = createUrlRecord({ ...baseInput, title: '' })
    expect(record.title).toBe('')
  })

  it('favIconUrl は文字列のときだけ受け付ける', () => {
    const record = createUrlRecord({
      ...baseInput,
      favIconUrl: 'https://example.com/favicon.ico',
    })
    expect(record.favIconUrl).toBe('https://example.com/favicon.ico')
    expect(Object.hasOwn(record, 'favIconUrl')).toBe(true)
  })

  it('不正な URL は INVALID_URL を投げる', () => {
    expect(() => createUrlRecord({ ...baseInput, url: '' })).toThrow(
      SavedTabsDomainError,
    )
  })

  it('isSameUrlRecord は ID で同一視する', () => {
    const a = createUrlRecord(baseInput)
    const b = createUrlRecord({ ...baseInput, title: 'Different' })
    expect(isSameUrlRecord(a, b)).toBe(true)
  })
})
