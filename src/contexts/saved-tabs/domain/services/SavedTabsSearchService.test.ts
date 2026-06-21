import { describe, expect, it } from 'vitest'

import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'

import { searchSavedTabs } from './SavedTabsSearchService'

const docs = createParentCategory({
  id: 'docs',
  name: 'Docs',
  domains: [],
  domainNames: ['example.com'],
})

const buildContext = (
  groupId: string,
  domain: string,
  urls: { id: string; url: string; title: string }[],
) => {
  const group = createTabGroup({
    id: groupId,
    domain,
    urlIds: urls.map((url) => url.id),
  })
  return {
    group,
    urls: urls.map((url) =>
      createUrlRecord({
        id: url.id,
        url: url.url,
        title: url.title,
        savedAt: 1_700_000_000_000,
      }),
    ),
  }
}

describe('SavedTabsSearchService.searchSavedTabs', () => {
  it('空クエリでは全件をそのまま返す', () => {
    const contexts = [
      buildContext('group-1', 'example.com', [
        { id: 'url-1', url: 'https://example.com/a', title: 'Hello' },
      ]),
    ]
    const result = searchSavedTabs({
      input: { query: '' },
      contexts,
      categories: [docs],
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.urls).toHaveLength(1)
    expect(result[0]?.categoryMatched).toBe(false)
  })

  it('URL 文字列にマッチする URL だけを残す', () => {
    const contexts = [
      buildContext('group-1', 'example.com', [
        { id: 'url-1', url: 'https://example.com/foo', title: 'A' },
        { id: 'url-2', url: 'https://example.com/bar', title: 'B' },
      ]),
    ]
    const result = searchSavedTabs({
      input: { query: 'foo' },
      contexts,
      categories: [docs],
    })
    expect(result[0]?.urls.map((url) => url.id)).toStrictEqual(['url-1'])
  })

  it('title にマッチする URL を残す', () => {
    const contexts = [
      buildContext('group-1', 'example.com', [
        { id: 'url-1', url: 'https://example.com/a', title: 'Match Me' },
        { id: 'url-2', url: 'https://example.com/b', title: 'Other' },
      ]),
    ]
    const result = searchSavedTabs({
      input: { query: 'match' },
      contexts,
      categories: [docs],
    })
    expect(result[0]?.urls.map((url) => url.id)).toStrictEqual(['url-1'])
  })

  it('domain にマッチする URL を残す', () => {
    const contexts = [
      buildContext('group-1', 'example.com', [
        { id: 'url-1', url: 'https://other/a', title: 'A' },
      ]),
    ]
    const result = searchSavedTabs({
      input: { query: 'example' },
      contexts,
      categories: [docs],
    })
    expect(result[0]?.urls.map((url) => url.id)).toStrictEqual(['url-1'])
  })

  it('カテゴリ名にマッチした場合はグループ全体を返す', () => {
    const contexts = [
      buildContext('group-1', 'example.com', [
        { id: 'url-1', url: 'https://example.com/x', title: 'NOPE' },
        { id: 'url-2', url: 'https://example.com/y', title: 'NOPE' },
      ]),
    ]
    const result = searchSavedTabs({
      input: { query: 'docs' },
      contexts,
      categories: [docs],
    })
    expect(result[0]?.categoryMatched).toBe(true)
    expect(result[0]?.urls.map((url) => url.id)).toStrictEqual([
      'url-1',
      'url-2',
    ])
  })

  it('どの URL も一致しない場合はグループごと除外する', () => {
    const contexts = [
      buildContext('group-1', 'other.example.com', [
        { id: 'url-1', url: 'https://other/a', title: 'A' },
      ]),
    ]
    const result = searchSavedTabs({
      input: { query: 'zzz' },
      contexts,
      categories: [],
    })
    expect(result).toHaveLength(0)
  })

  it('大文字小文字を区別せずにマッチする', () => {
    const contexts = [
      buildContext('group-1', 'example.com', [
        { id: 'url-1', url: 'https://example.com/A', title: 'HELLO' },
      ]),
    ]
    const result = searchSavedTabs({
      input: { query: 'hello' },
      contexts,
      categories: [],
    })
    expect(result[0]?.urls).toHaveLength(1)
  })
})
