import { describe, expect, it } from 'vitest' // eslint-disable-line

import { inferUserInterests } from './inferInterests'

describe('inferUserInterests', () => {
  it('ドメインとカテゴリの偏りから興味候補を返す', () => {
    const result = inferUserInterests([
      {
        id: '1',
        url: 'https://react.dev/learn',
        title: 'React Learn',
        domain: 'react.dev',
        savedAt: new Date('2026-03-04T00:00:00.000Z').getTime(),
        savedInTabGroups: ['react.dev'],
        savedInProjects: ['UI Research'],
        subCategories: ['Frontend'],
        projectCategories: ['Favorites'],
        parentCategories: ['Frontend'],
      },
      {
        id: '2',
        url: 'https://react.dev/reference',
        title: 'React Reference',
        domain: 'react.dev',
        savedAt: new Date('2026-03-03T00:00:00.000Z').getTime(),
        savedInTabGroups: ['react.dev'],
        savedInProjects: ['UI Research'],
        subCategories: ['Frontend'],
        projectCategories: ['Favorites'],
        parentCategories: ['Frontend'],
      },
      {
        id: '3',
        url: 'https://vercel.com/blog/ai',
        title: 'AI SDK Update',
        domain: 'vercel.com',
        savedAt: new Date('2026-03-02T00:00:00.000Z').getTime(),
        savedInTabGroups: ['vercel.com'],
        savedInProjects: ['UI Research'],
        subCategories: ['AI'],
        projectCategories: ['Reading'],
        parentCategories: ['Frontend'],
      },
    ])

    expect(result.summary).toContain('Frontend')
    expect(result.evidence.topDomains[0]).toStrictEqual({
      count: 2,
      value: 'react.dev',
    })
    expect(result.evidence.topCategories[0]).toStrictEqual({
      count: 3,
      value: 'Frontend',
    })
    expect(result.chartSpecs).toStrictEqual([
      {
        categoryKey: 'label',
        data: [
          { count: 3, label: 'Frontend' },
          { count: 2, label: 'Favorites' },
          { count: 1, label: 'AI' },
        ],
        description: '最近保存したカテゴリ比率',
        series: [{ colorToken: 'chart-1', dataKey: 'count', label: '保存数' }],
        title: 'よく保存しているジャンル',
        type: 'pie',
        valueFormat: 'count',
      },
      {
        data: [
          { count: 3, label: 'Frontend' },
          { count: 2, label: 'Favorites' },
          { count: 1, label: 'AI' },
        ],
        description: '最近保存したカテゴリ件数',
        series: [{ colorToken: 'chart-1', dataKey: 'count', label: '保存数' }],
        title: 'ジャンル別の保存数',
        type: 'bar',
        valueFormat: 'count',
        xKey: 'label',
      },
      {
        data: [
          { count: 2, label: 'react.dev' },
          { count: 1, label: 'vercel.com' },
        ],
        description: '最近保存したドメイン件数',
        series: [{ colorToken: 'chart-2', dataKey: 'count', label: '保存数' }],
        title: 'よく保存しているドメイン',
        type: 'bar',
        valueFormat: 'count',
        xKey: 'label',
      },
    ])
  })

  it('データが少ないときは推測弱めのフラグを立てる', () => {
    const result = inferUserInterests([
      {
        id: '1',
        url: 'https://example.com/one',
        title: 'One',
        domain: 'example.com',
        savedAt: 1,
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: [],
      },
    ])

    expect(result.isTentative).toBe(true)
    expect(result.summary).toContain('判断材料')
  })

  it('保存データが無いときは判断不能を返す', () => {
    const result = inferUserInterests([])

    expect(result).toStrictEqual({
      summary: 'まだ保存データがないため、興味の傾向は判断できません。',
      isTentative: true,
      evidence: {
        topDomains: [],
        topCategories: [],
      },
      chartSpecs: [],
    })
  })

  it('空文字の値は集計から除外する', () => {
    const result = inferUserInterests([
      {
        id: '1',
        url: 'https://example.com',
        title: 'One',
        domain: '',
        savedAt: 1,
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [''],
        projectCategories: [''],
        parentCategories: ['Tech'],
      },
      {
        id: '2',
        url: 'https://another.example.com',
        title: 'Two',
        domain: 'another.example.com',
        savedAt: 2,
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [''],
        projectCategories: [],
        parentCategories: ['Tech'],
      },
      {
        id: '3',
        url: 'https://third.example.com',
        title: 'Three',
        domain: 'another.example.com',
        savedAt: 3,
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: ['Tech'],
      },
    ])

    expect(result.evidence.topDomains[0]).toStrictEqual({
      count: 2,
      value: 'another.example.com',
    })
    expect(result.evidence.topCategories[0]).toStrictEqual({
      count: 3,
      value: 'Tech',
    })
  })

  it('カテゴリが無い場合は弱いカテゴリ傾向メッセージを返す', () => {
    const result = inferUserInterests([
      {
        id: '1',
        url: 'https://react.dev',
        title: 'React',
        domain: 'react.dev',
        savedAt: 1,
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: [],
      },
      {
        id: '2',
        url: 'https://react.dev/reference',
        title: 'Reference',
        domain: 'react.dev',
        savedAt: 2,
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: [],
      },
      {
        id: '3',
        url: 'https://vercel.com',
        title: 'Vercel',
        domain: 'vercel.com',
        savedAt: 3,
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: [],
        projectCategories: [],
        parentCategories: [],
      },
    ])

    expect(result.summary).toContain('カテゴリ偏りはまだ弱めです。')
    expect(result.chartSpecs).toStrictEqual([
      {
        data: [
          { count: 2, label: 'react.dev' },
          { count: 1, label: 'vercel.com' },
        ],
        description: '最近保存したドメイン件数',
        series: [{ colorToken: 'chart-2', dataKey: 'count', label: '保存数' }],
        title: 'よく保存しているドメイン',
        type: 'bar',
        valueFormat: 'count',
        xKey: 'label',
      },
    ])
  })

  it('英語ではカテゴリ一覧をカンマ区切りで要約する', () => {
    const result = inferUserInterests(
      [
        {
          id: '1',
          url: 'https://react.dev',
          title: 'React',
          domain: 'react.dev',
          savedAt: 1,
          savedInTabGroups: [],
          savedInProjects: [],
          subCategories: ['Frontend'],
          projectCategories: ['Docs'],
          parentCategories: [],
        },
        {
          id: '2',
          url: 'https://react.dev/reference',
          title: 'Reference',
          domain: 'react.dev',
          savedAt: 2,
          savedInTabGroups: [],
          savedInProjects: [],
          subCategories: ['Frontend'],
          projectCategories: ['Docs'],
          parentCategories: [],
        },
        {
          id: '3',
          url: 'https://vercel.com',
          title: 'Vercel',
          domain: 'vercel.com',
          savedAt: 3,
          savedInTabGroups: [],
          savedInProjects: [],
          subCategories: ['AI'],
          projectCategories: [],
          parentCategories: [],
        },
      ],
      'en',
    )

    expect(result.summary).toContain('Docs, Frontend, AI')
  })

  it('ドメインが無くカテゴリだけある場合はカテゴリ chart だけを返す', () => {
    const result = inferUserInterests([
      {
        id: '1',
        url: 'https://example.com',
        title: 'One',
        domain: '',
        savedAt: 1,
        savedInTabGroups: [],
        savedInProjects: [],
        subCategories: ['Research'],
        projectCategories: [],
        parentCategories: [],
      },
    ])

    expect(result.evidence.topDomains).toStrictEqual([])
    expect(result.evidence.topCategories).toStrictEqual([
      { count: 1, value: 'Research' },
    ])
    expect(
      result.chartSpecs.every(
        (chart) => chart.title !== 'よく保存しているドメイン',
      ),
    ).toBe(true)
  })
})
