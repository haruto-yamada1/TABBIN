import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import {
  isSameTabGroup,
  tabGroupContainsUrlRecord,
  tabGroupUrlCount,
} from './TabGroup'

const baseInput = {
  id: 'group-1',
  domain: 'example.com',
  memberships: ['url-1', 'url-2'].map((urlId) => ({ urlId })),
}

describe('TabGroup entity', () => {
  it('正常な入力からエンティティを生成できる', () => {
    const group = createTabGroup(baseInput)
    expect(group.id).toBe('group-1')
    expect(group.collection.definition.domain).toBe('example.com')
    expect(group.memberships.map(({ urlId }) => urlId)).toStrictEqual([
      'url-1',
      'url-2',
    ])
    expect(group.collection.groupId).toBeUndefined()
    expect(group.savedAt).toBe(0)
  })

  it('parentCategoryId / savedAt を保持できる', () => {
    const group = createTabGroup({
      ...baseInput,
      parentCategoryId: 'docs',
      savedAt: 1_700_000_000_000,
    })
    expect(group.collection.groupId).toBe('docs')
    expect(group.savedAt).toBe(1_700_000_000_000)
  })

  it('membership の URL ID に重複があると INVALID_TAB_GROUP を投げる', () => {
    expect(() =>
      createTabGroup({
        ...baseInput,
        memberships: ['dup', 'dup'].map((urlId) => ({ urlId })),
      }),
    ).toThrow(SavedTabsDomainError)
  })

  it('membership の URL ID に空文字列が混ざると INVALID_ID を投げる', () => {
    expect(() =>
      createTabGroup({
        ...baseInput,
        memberships: ['ok', ''].map((urlId) => ({ urlId })),
      }),
    ).toThrow(SavedTabsDomainError)
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
