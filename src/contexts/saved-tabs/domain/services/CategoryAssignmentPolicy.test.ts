import { describe, expect, it } from 'vitest'

import { createParentCategory } from '../entities/ParentCategory'
import { createTabGroup } from '../entities/TabGroup'
import { createDomainName } from '../value-objects/DomainName'
import { createParentCategoryId } from '../value-objects/ParentCategoryId'
import { createTabGroupId } from '../value-objects/TabGroupId'
import {
  buildCategoryLookup,
  isUncategorizedTabGroup,
  resolveCategoryForTabGroup,
} from './CategoryAssignmentPolicy'

const docs = createParentCategory({
  id: 'docs',
  name: 'Docs',
  domains: ['group-docs'],
  domainNames: ['example.com'],
})

const news = createParentCategory({
  id: 'news',
  name: 'News',
  domains: ['group-news'],
  domainNames: ['news.example.com'],
})

describe('CategoryAssignmentPolicy.buildCategoryLookup', () => {
  it('id / tabGroupId / domainName の各キーで引ける', () => {
    const lookup = buildCategoryLookup([docs, news])
    expect(lookup.byId.get(createParentCategoryId('docs'))).toStrictEqual(docs)
    expect(
      lookup.byTabGroupId.get(createTabGroupId('group-docs')),
    ).toStrictEqual(docs)
    expect(
      lookup.byDomainName.get(createDomainName('news.example.com')),
    ).toStrictEqual(news)
  })

  it('複数カテゴリが同一 tabGroupId / domainName を宣言したら先勝ちで保持する', () => {
    const conflicting = createParentCategory({
      id: 'docs-conflict',
      name: 'Docs Conflict',
      domains: ['group-docs'],
      domainNames: ['example.com'],
    })
    const lookup = buildCategoryLookup([docs, conflicting])
    expect(lookup.byTabGroupId.get(createTabGroupId('group-docs'))?.id).toBe(
      'docs',
    )
    expect(lookup.byDomainName.get(createDomainName('example.com'))?.id).toBe(
      'docs',
    )
  })
})

describe('CategoryAssignmentPolicy.resolveCategoryForTabGroup', () => {
  const lookup = buildCategoryLookup([docs, news])

  it('parentCategoryId が一致するときは最優先で解決する', () => {
    const group = createTabGroup({
      id: 'group-news',
      domain: 'news.example.com',
      urlIds: [],
      parentCategoryId: 'docs',
    })
    expect(resolveCategoryForTabGroup(group, lookup)?.id).toBe('docs')
  })

  it('parentCategoryId が無くても tabGroupId 一致で解決する', () => {
    const group = createTabGroup({
      id: 'group-docs',
      domain: 'other.example.com',
      urlIds: [],
    })
    expect(resolveCategoryForTabGroup(group, lookup)?.id).toBe('docs')
  })

  it('parentCategoryId / tabGroupId が外れても domainName で解決する', () => {
    const group = createTabGroup({
      id: 'group-other',
      domain: 'example.com',
      urlIds: [],
    })
    expect(resolveCategoryForTabGroup(group, lookup)?.id).toBe('docs')
  })

  it('どこにも一致しないグループは未分類として扱う', () => {
    const group = createTabGroup({
      id: 'group-other',
      domain: 'unknown.example.com',
      urlIds: [],
    })
    expect(resolveCategoryForTabGroup(group, lookup)).toBeUndefined()
    expect(isUncategorizedTabGroup(group, lookup)).toBe(true)
  })
})
