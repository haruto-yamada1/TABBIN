import { describe, expect, it } from 'vitest' // eslint-disable-line

import type { AiSavedUrlRecord } from '@/features/ai-chat/types'

import { findUrlsAddedInMonth, searchSavedUrls } from './buildAiContext'

const createRecord = (
  overrides: Partial<AiSavedUrlRecord> = {},
): AiSavedUrlRecord => ({
  domain: 'react.dev',
  id: 'url-1',
  parentCategories: [],
  projectCategories: [],
  savedAt: new Date('2026-03-01T00:00:00.000Z').getTime(),
  savedInProjects: [],
  savedInTabGroups: [],
  subCategories: [],
  title: 'React Learn',
  url: 'https://react.dev/learn',
  ...overrides,
})

describe('findUrlsAddedInMonth', () => {
  it('指定した月に追加された URL だけを返す', () => {
    const records = [
      createRecord(),
      createRecord({
        id: 'url-2',
        savedAt: new Date('2026-02-28T14:59:59.000Z').getTime(),
      }),
    ]

    expect(findUrlsAddedInMonth(records, 2026, 3)).toStrictEqual([records[0]])
  })

  it('指定した月をタイムゾーン基準で判定する', () => {
    const records = [
      createRecord({
        savedAt: new Date('2026-02-28T15:30:00.000Z').getTime(),
      }),
      createRecord({
        id: 'url-2',
        savedAt: new Date('2026-02-28T14:30:00.000Z').getTime(),
      }),
    ]

    expect(findUrlsAddedInMonth(records, 2026, 3, 'Asia/Tokyo')).toStrictEqual([
      records[0],
    ])
  })
})

describe('searchSavedUrls', () => {
  it('title, domain, project, category を横断して検索する', () => {
    const records = [
      createRecord({
        parentCategories: ['Frontend'],
        projectCategories: ['Favorites'],
        savedInProjects: ['UI Research'],
        savedInTabGroups: ['react.dev'],
        subCategories: ['Frontend'],
      }),
      createRecord({
        domain: 'zenn.dev',
        id: 'url-2',
        projectCategories: ['Later'],
        savedInProjects: ['Reading'],
        savedInTabGroups: ['zenn.dev'],
        title: 'Interesting Article',
        url: 'https://zenn.dev/articles/ai',
      }),
    ]

    expect(searchSavedUrls(records, 'frontend')).toStrictEqual([records[0]])
    expect(searchSavedUrls(records, 'reading')).toStrictEqual([records[1]])
  })

  it('空クエリなら全件を返し、current projectionの不正URL domainも扱う', () => {
    const records = [
      createRecord({ domain: '', title: 'Broken', url: 'not a url' }),
    ]

    expect(searchSavedUrls(records, '   ')).toStrictEqual(records)
    expect(searchSavedUrls(records, 'broken')).toStrictEqual(records)
  })
})
