import { describe, expect, it } from 'vitest'

import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UrlRecord,
} from '@/types/storage'

import {
  buildAiSavedUrlRecords,
  findUrlsAddedInMonth,
  searchSavedUrls,
} from './buildAiContext'

describe('buildAiSavedUrlRecords', () => {
  it('savedTabs と customProjects の文脈を URL ごとに統合する', () => {
    const urlRecords: UrlRecord[] = [
      {
        id: 'url-1',
        url: 'https://react.dev/learn',
        title: 'React Learn',
        savedAt: new Date('2026-03-01T12:00:00.000Z').getTime(),
      },
      {
        id: 'url-2',
        url: 'https://vercel.com/blog/ai',
        title: 'AI Blog',
        savedAt: new Date('2026-02-10T12:00:00.000Z').getTime(),
      },
    ]
    const savedTabs: TabGroup[] = [
      {
        id: 'group-1',
        domain: 'react.dev',
        urlIds: ['url-1'],
        urlSubCategories: {
          'url-1': 'Frontend',
        },
      },
    ]
    const customProjects: CustomProject[] = [
      {
        id: 'project-1',
        name: 'UI Research',
        urlIds: ['url-1', 'url-2'],
        urlMetadata: {
          'url-1': {
            category: 'Favorites',
          },
          'url-2': {
            category: 'Reading',
          },
        },
        categories: ['Favorites', 'Reading'],
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const parentCategories: ParentCategory[] = [
      {
        id: 'cat-1',
        name: 'Frontend',
        domains: ['group-1'],
        domainNames: ['react.dev'],
      },
    ]

    const records = buildAiSavedUrlRecords({
      customProjects,
      parentCategories,
      savedTabs,
      urlRecords,
    })

    expect(records).toStrictEqual([
      {
        id: 'url-1',
        url: 'https://react.dev/learn',
        title: 'React Learn',
        domain: 'react.dev',
        savedAt: new Date('2026-03-01T12:00:00.000Z').getTime(),
        savedInTabGroups: ['react.dev'],
        savedInProjects: ['UI Research'],
        subCategories: ['Frontend'],
        projectCategories: ['Favorites'],
        parentCategories: ['Frontend'],
      },
      {
        id: 'url-2',
        url: 'https://vercel.com/blog/ai',
        title: 'AI Blog',
        domain: 'vercel.com',
        savedAt: new Date('2026-02-10T12:00:00.000Z').getTime(),
        savedInTabGroups: [],
        savedInProjects: ['UI Research'],
        subCategories: [],
        projectCategories: ['Reading'],
        parentCategories: [],
      },
    ])
  })

  it('parent category は domainNames 側の一致でも拾う', () => {
    const records = buildAiSavedUrlRecords({
      urlRecords: [
        {
          id: 'url-1',
          url: 'https://react.dev/learn',
          title: 'React Learn',
          savedAt: 1,
        },
      ],
      savedTabs: [
        {
          id: 'group-1',
          domain: 'react.dev',
          urlIds: ['url-1'],
        },
      ],
      customProjects: [],
      parentCategories: [
        {
          id: 'cat-1',
          name: 'Domain Match',
          domains: [],
          domainNames: ['react.dev'],
        },
      ],
    })

    expect(records[0]?.parentCategories).toStrictEqual(['Domain Match'])
  })

  it('project metadata と parent category が一致しない場合はカテゴリ配列を空にする', () => {
    const records = buildAiSavedUrlRecords({
      urlRecords: [
        {
          id: 'url-1',
          url: 'not-a-url',
          title: 'Invalid URL',
          savedAt: 1,
        },
      ],
      savedTabs: [
        {
          id: 'group-1',
          domain: 'plain-domain',
          urlIds: ['url-1'],
        },
      ],
      customProjects: [
        {
          categories: [],
          createdAt: 1,
          id: 'project-1',
          name: 'Project without metadata',
          updatedAt: 1,
          urlIds: ['url-1'],
        },
      ],
      parentCategories: [
        {
          domainNames: ['other-domain'],
          domains: ['other-group'],
          id: 'cat-1',
          name: 'Other',
        },
      ],
    })

    expect(records[0]).toStrictEqual(
      expect.objectContaining({
        domain: 'not-a-url',
        parentCategories: [],
        projectCategories: [],
        savedInProjects: ['Project without metadata'],
      }),
    )
  })
})

describe('findUrlsAddedInMonth', () => {
  it('指定した月に追加された URL だけを返す', () => {
    const records = [
      {
        id: 'url-1',
        url: 'https://react.dev/learn',
        title: 'React Learn',
        domain: 'react.dev',
        savedAt: new Date('2026-03-01T00:00:00.000Z').getTime(),
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: [],
      },
      {
        id: 'url-2',
        url: 'https://vercel.com/blog/ai',
        title: 'AI Blog',
        domain: 'vercel.com',
        savedAt: new Date('2026-02-28T14:59:59.000Z').getTime(),
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: [],
      },
    ]

    expect(findUrlsAddedInMonth(records, 2026, 3)).toStrictEqual([records[0]])
  })

  it('指定した月をタイムゾーン基準で判定する', () => {
    const records = [
      {
        id: 'url-1',
        url: 'https://react.dev/learn',
        title: 'React Learn',
        domain: 'react.dev',
        savedAt: new Date('2026-02-28T15:30:00.000Z').getTime(),
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: [],
      },
      {
        id: 'url-2',
        url: 'https://vercel.com/blog/ai',
        title: 'AI Blog',
        domain: 'vercel.com',
        savedAt: new Date('2026-02-28T14:30:00.000Z').getTime(),
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: [],
      },
    ]

    expect(findUrlsAddedInMonth(records, 2026, 3, 'Asia/Tokyo')).toStrictEqual([
      records[0],
    ])
  })
})

describe('searchSavedUrls', () => {
  it('title, domain, project, category を横断して検索する', () => {
    const records = [
      {
        id: 'url-1',
        url: 'https://react.dev/learn',
        title: 'React Learn',
        domain: 'react.dev',
        savedAt: 1,
        savedInTabGroups: ['react.dev'],
        savedInProjects: ['UI Research'],
        subCategories: ['Frontend'],
        projectCategories: ['Favorites'],
        parentCategories: ['Frontend'],
      },
      {
        id: 'url-2',
        url: 'https://zenn.dev/articles/ai',
        title: 'Interesting Article',
        domain: 'zenn.dev',
        savedAt: 2,
        savedInTabGroups: ['zenn.dev'],
        savedInProjects: ['Reading'],
        subCategories: [],
        projectCategories: ['Later'],
        parentCategories: [],
      },
    ]

    expect(searchSavedUrls(records, 'frontend')).toStrictEqual([records[0]])
    expect(searchSavedUrls(records, 'reading')).toStrictEqual([records[1]])
  })

  it('空クエリなら全件を返し、不正URLは domain に元文字列を使う', () => {
    const records = buildAiSavedUrlRecords({
      urlRecords: [
        {
          id: 'url-1',
          url: 'not a url',
          title: 'Broken',
          savedAt: 1,
        },
      ],
      savedTabs: [],
      customProjects: [],
      parentCategories: [],
    })

    expect(records[0]?.domain).toBe('not a url')
    expect(searchSavedUrls(records, '   ')).toStrictEqual(records)
  })
})
