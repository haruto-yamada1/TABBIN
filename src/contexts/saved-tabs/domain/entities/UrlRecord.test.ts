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
  it('正常な入力からエンティティを生成できる', () => {
    const record = createUrlRecord(baseInput)
    expect(record.id).toBe('record-1')
    expect(record.url).toBe('https://example.com')
    expect(record.title).toBe('Example')
    expect(record.savedAt).toBe(1_700_000_000_000)
    expect(record.favIconUrl).toBeUndefined()
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
