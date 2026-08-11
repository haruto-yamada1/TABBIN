import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { createDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createTabGroupId } from '@/contexts/saved-tabs/domain/value-objects/TabGroupId'

import {
  createParentCategory,
  isSameParentCategory,
  parentCategoryContainsDomainName,
  parentCategoryContainsTabGroup,
} from './ParentCategory'

const baseInput = {
  id: 'docs',
  name: 'Docs',
  collections: [{ id: 'group-1', domain: 'example.com' }],
}

describe('ParentCategory entity', () => {
  it('正常な入力からエンティティを生成できる', () => {
    const category = createParentCategory(baseInput)
    expect(category.id).toBe('docs')
    expect(category.name).toBe('Docs')
    expect(category.collections.map(({ id }) => id)).toStrictEqual(['group-1'])
    expect(category.collections.map(({ domain }) => domain)).toStrictEqual([
      'example.com',
    ])
  })

  it('空の collections を許容する', () => {
    const category = createParentCategory({
      ...baseInput,
      collections: [],
    })
    expect(category.collections.map(({ id }) => id)).toStrictEqual([])
    expect(category.collections.map(({ domain }) => domain)).toStrictEqual([])
  })

  it('不正な category name は INVALID_CATEGORY_NAME を投げる', () => {
    expect(() => createParentCategory({ ...baseInput, name: '' })).toThrow(
      SavedTabsDomainError,
    )
  })

  it('parentCategoryContainsTabGroup は ID 一致で true', () => {
    const category = createParentCategory(baseInput)
    expect(
      parentCategoryContainsTabGroup(category, createTabGroupId('group-1')),
    ).toBe(true)
    expect(
      parentCategoryContainsTabGroup(category, createTabGroupId('group-2')),
    ).toBe(false)
  })

  it('parentCategoryContainsDomainName は ドメイン名一致で true', () => {
    const category = createParentCategory(baseInput)
    expect(
      parentCategoryContainsDomainName(
        category,
        createDomainName('example.com'),
      ),
    ).toBe(true)
    expect(
      parentCategoryContainsDomainName(category, createDomainName('other.com')),
    ).toBe(false)
  })

  it('isSameParentCategory は ID で同一視する', () => {
    const a = createParentCategory(baseInput)
    const b = createParentCategory({ ...baseInput, name: 'Renamed' })
    expect(isSameParentCategory(a, b)).toBe(true)
  })

  // 回帰: 保存フロー (getTabDomain) が `https://example.com` のように
  // スキーム付き文字列を collection domain に書き込む既存データを開くとき、
  // createDomainName が「ドメイン名にスキームを含めることはできません」で
  // 例外を投げてタブを開けなくする不具合 (issue: タブ消失・保存タブ開封失敗) の回帰。
  it('collection domain にスキーム付き文字列が含まれても hostname へ正規化して保持する', () => {
    const category = createParentCategory({
      ...baseInput,
      collections: [
        'https://example.com',
        'http://other.com/path',
        'plain.org',
      ].map((domain) => ({ id: domain, domain })),
    })
    expect(category.collections.map(({ domain }) => domain)).toStrictEqual([
      'example.com',
      'other.com',
      'plain.org',
    ])
  })

  it('collection domain のスキーム付き値は小文字へ正規化される', () => {
    const category = createParentCategory({
      ...baseInput,
      collections: ['https://Example.COM'].map((domain) => ({
        id: domain,
        domain,
      })),
    })
    expect(category.collections.map(({ domain }) => domain)).toStrictEqual([
      'example.com',
    ])
  })

  it('parentCategoryContainsDomainName は正規化済みの collection domain と一致する', () => {
    const category = createParentCategory({
      ...baseInput,
      collections: ['https://example.com'].map((domain) => ({
        id: domain,
        domain,
      })),
    })
    expect(
      parentCategoryContainsDomainName(
        category,
        createDomainName('example.com'),
      ),
    ).toBe(true)
  })

  // 回帰 (CodeRabbit PR #625): normalizeDomainString で有効な hostname が取れない
  // 不正エントリ (host-less スキーム / パース失敗形 / 空白のみ) が混入していても、
  // 1 件の不正値でカテゴリ全体の生成 (toDomainParentCategories) が落ちず、
  // 不正エントリだけ除外して有効なドメインだけ残る。
  it('host-less / パース失敗 / 空白のみの collection は除外されカテゴリ生成は成功する', () => {
    const category = createParentCategory({
      ...baseInput,
      collections: [
        'https://example.com',
        'https://',
        '://invalid',
        '   ',
        '',
        'other.com',
      ].map((domain) => ({ id: domain, domain })),
    })
    expect(category.collections.map(({ domain }) => domain)).toStrictEqual([
      'example.com',
      'other.com',
    ])
  })

  it('collection domain が全て不正でもカテゴリ生成は例外を投げず空配列になる', () => {
    const category = createParentCategory({
      ...baseInput,
      collections: ['https://', '://invalid', '   '].map((domain) => ({
        id: domain,
        domain,
      })),
    })
    expect(category.collections.map(({ domain }) => domain)).toStrictEqual([])
  })
})
