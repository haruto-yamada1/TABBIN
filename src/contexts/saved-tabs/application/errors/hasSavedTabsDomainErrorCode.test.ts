import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

import { hasSavedTabsDomainErrorCode } from './hasSavedTabsDomainErrorCode'

describe('hasSavedTabsDomainErrorCode', () => {
  it('分類コードが一致する SavedTabsDomainError に true を返す', () => {
    const error = new SavedTabsDomainError(
      'カテゴリにドメインが割り当てられています',
      'PARENT_CATEGORY_NOT_EMPTY',
    )

    expect(
      hasSavedTabsDomainErrorCode(error, 'PARENT_CATEGORY_NOT_EMPTY'),
    ).toBe(true)
  })

  it('分類コードが異なる SavedTabsDomainError に false を返す', () => {
    const error = new SavedTabsDomainError(
      'カテゴリが見つかりません',
      'PARENT_CATEGORY_NOT_FOUND',
    )

    expect(
      hasSavedTabsDomainErrorCode(error, 'PARENT_CATEGORY_NOT_EMPTY'),
    ).toBe(false)
  })

  it.each([
    new Error('PARENT_CATEGORY_NOT_EMPTY'),
    { code: 'PARENT_CATEGORY_NOT_EMPTY' },
    'PARENT_CATEGORY_NOT_EMPTY',
    null,
    undefined,
  ])('SavedTabsDomainError でない値に false を返す: %j', (error) => {
    expect(
      hasSavedTabsDomainErrorCode(error, 'PARENT_CATEGORY_NOT_EMPTY'),
    ).toBe(false)
  })
})
