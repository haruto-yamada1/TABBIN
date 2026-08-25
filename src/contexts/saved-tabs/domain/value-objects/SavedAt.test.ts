import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

import {
  createSavedAt,
  equalsSavedAt,
  isSavedAtBefore,
  savedAtToMillis,
} from './SavedAt'

describe('SavedAt 値オブジェクト', () => {
  it('0 以上の整数を許容する', () => {
    const savedAt = createSavedAt(1_700_000_000_000)
    expect(savedAtToMillis(savedAt)).toBe(1_700_000_000_000)
  })

  it('0 も許容する', () => {
    const savedAt = createSavedAt(0)
    expect(savedAtToMillis(savedAt)).toBe(0)
  })

  it('-0 は INVALID_SAVED_AT で拒否する', () => {
    expect(() => createSavedAt(-0)).toThrow(SavedTabsDomainError)
  })

  it('負の値は INVALID_SAVED_AT で拒否する', () => {
    expect(() => createSavedAt(-1)).toThrow(SavedTabsDomainError)
  })

  it('NaN / Infinity は拒否する', () => {
    expect(() => createSavedAt(Number.NaN)).toThrow(SavedTabsDomainError)
    expect(() => createSavedAt(Number.POSITIVE_INFINITY)).toThrow(
      SavedTabsDomainError,
    )
  })

  it('小数は拒否する', () => {
    expect(() => createSavedAt(1.5)).toThrow(SavedTabsDomainError)
  })

  it('isSavedAtBefore で前後関係を判定できる', () => {
    const a = createSavedAt(1)
    const b = createSavedAt(2)
    expect(isSavedAtBefore(a, b)).toBe(true)
    expect(isSavedAtBefore(b, a)).toBe(false)
    expect(equalsSavedAt(a, createSavedAt(1))).toBe(true)
  })
})
