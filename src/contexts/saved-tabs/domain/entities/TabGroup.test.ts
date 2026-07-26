import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

import {
  createTabGroup,
  isSameTabGroup,
  tabGroupContainsUrlRecord,
  tabGroupUrlCount,
} from './TabGroup'

const baseInput = {
  id: 'group-1',
  domain: 'example.com',
  urlIds: ['url-1', 'url-2'],
}

describe('TabGroup entity', () => {
  it('正常な入力からエンティティを生成できる', () => {
    const group = createTabGroup(baseInput)
    expect(group.id).toBe('group-1')
    expect(group.domain).toBe('example.com')
    expect(group.urlIds).toStrictEqual(['url-1', 'url-2'])
    expect(group.parentCategoryId).toBeUndefined()
    expect(group.savedAt).toBeUndefined()
  })

  it('parentCategoryId / savedAt を保持できる', () => {
    const group = createTabGroup({
      ...baseInput,
      parentCategoryId: 'docs',
      savedAt: 1_700_000_000_000,
    })
    expect(group.parentCategoryId).toBe('docs')
    expect(group.savedAt).toBe(1_700_000_000_000)
  })

  it('urlIds に重複があると INVALID_TAB_GROUP を投げる', () => {
    expect(() =>
      createTabGroup({ ...baseInput, urlIds: ['dup', 'dup'] }),
    ).toThrow(SavedTabsDomainError)
  })

  it('urlIds に空文字列が混ざると INVALID_ID を投げる', () => {
    expect(() => createTabGroup({ ...baseInput, urlIds: ['ok', ''] })).toThrow(
      SavedTabsDomainError,
    )
  })

  it('tabGroupUrlCount は URL 件数を返す', () => {
    const group = createTabGroup(baseInput)
    expect(tabGroupUrlCount(group)).toBe(2)
  })

  it('tabGroupContainsUrlRecord は所属判定を行う', () => {
    const group = createTabGroup(baseInput)
    expect(tabGroupContainsUrlRecord(group, createUrlRecordId('url-1'))).toBe(
      true,
    )
    expect(tabGroupContainsUrlRecord(group, createUrlRecordId('url-3'))).toBe(
      false,
    )
  })

  it('isSameTabGroup は ID で同一視する', () => {
    const a = createTabGroup(baseInput)
    const b = createTabGroup({ ...baseInput, domain: 'other.com' })
    expect(isSameTabGroup(a, b)).toBe(true)
  })
})
