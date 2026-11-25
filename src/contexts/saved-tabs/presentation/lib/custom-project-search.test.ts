import { describe, expect, it, vi } from 'vitest'

import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import { createCustomProjectSearch } from './custom-project-search'

const createProjects = (): CustomProject[] => [
  {
    id: 'project-1',
    name: 'Reading List',
    memberships: ['url-1', 'url-2'].map((urlId) => ({
      urlId,
      ...{
        'url-1': { category: 'Later' },
        'url-2': { category: 'Watch' },
      }?.[urlId],
    })),
    categories: ['Later', 'Watch'],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'project-2',
    name: 'Work',
    memberships: ['url-3'].map((urlId) => ({ urlId })),
    categories: [],
    createdAt: 2,
    updatedAt: 2,
  },
]

describe('createCustomProjectSearch', () => {
  it('検索語が空なら元のプロジェクト配列を返す', async () => {
    const projects = createProjects()

    const loadProjectUrls = vi.fn(async () => new Map())
    const search = createCustomProjectSearch(projects, loadProjectUrls)

    expect(await search('  ')).toBe(projects)
    expect(loadProjectUrls).not.toHaveBeenCalled()
  })

  it('プロジェクト名一致は URL 解決なしでそのまま返す', async () => {
    const projects = createProjects().slice(0, 1)
    const loadProjectUrls = vi.fn(async () => new Map())
    const search = createCustomProjectSearch(projects, loadProjectUrls)

    expect(await search('Reading')).toStrictEqual(projects)
    expect(loadProjectUrls).not.toHaveBeenCalled()
  })

  it('urlIds ベースの URL タイトル一致で対象プロジェクトと一致 URL だけを返す', async () => {
    const projects = createProjects()

    const search = createCustomProjectSearch(
      projects,
      async () =>
        new Map([
          [
            'project-1',
            [
              {
                id: 'url-1',
                url: 'https://example.com/docker-cmd',
                title: 'Docker CMD',
                savedAt: 10,
                category: 'Later',
              },
              {
                id: 'url-2',
                url: 'https://example.com/other',
                title: 'Other',
                savedAt: 11,
                category: 'Watch',
              },
            ],
          ],
          [
            'project-2',
            [
              {
                id: 'url-3',
                url: 'https://work.example.com',
                title: 'Meeting notes',
                savedAt: 12,
              },
            ],
          ],
        ]),
    )

    const result = await search('docker')

    expect(result).toStrictEqual([
      {
        ...projects[0],
        memberships: ['url-1'].map((urlId) => ({
          urlId,
          ...{ 'url-1': { category: 'Later' } }?.[urlId],
        })),
        urls: [
          {
            id: 'url-1',
            url: 'https://example.com/docker-cmd',
            title: 'Docker CMD',
            savedAt: 10,
            category: 'Later',
          },
        ],
      },
    ])
  })

  it('同じ URL 文字列でも異なる URL ID を保持し、同一 ID は一件にまとめる', async () => {
    const project: CustomProject = {
      id: 'project-duplicate-url',
      name: 'Duplicate URL',
      categories: [],
      createdAt: 1,
      updatedAt: 1,
    }

    const search = createCustomProjectSearch(
      [project],
      async () =>
        new Map([
          [
            project.id,
            [
              {
                id: 'url-1',
                url: 'https://example.com/react',
                title: 'React Guide',
                savedAt: 1,
              },
              {
                id: 'url-2',
                url: 'https://example.com/react',
                title: 'React Guide Copy',
                savedAt: 2,
              },
              {
                id: 'url-1',
                url: 'https://example.com/react',
                title: 'React Guide duplicate',
                savedAt: 3,
              },
            ],
          ],
        ]),
    )

    const result = await search('react')
    expect(result[0]?.urls).toStrictEqual([
      {
        id: 'url-1',
        savedAt: 1,
        title: 'React Guide',
        url: 'https://example.com/react',
      },
      {
        id: 'url-2',
        savedAt: 2,
        title: 'React Guide Copy',
        url: 'https://example.com/react',
      },
    ])
  })

  it('retries a failed URL read and reuses the successful result', async () => {
    const projects = createProjects()
    const loadProjectUrls = vi
      .fn()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue(new Map())
    const search = createCustomProjectSearch(projects, loadProjectUrls)

    await expect(search('missing')).rejects.toThrow('read failed')
    expect(await search('missing')).toEqual([])
    expect(await search('Reading')).toEqual([projects[0]])
    expect(loadProjectUrls).toHaveBeenCalledTimes(2)
  })
})
