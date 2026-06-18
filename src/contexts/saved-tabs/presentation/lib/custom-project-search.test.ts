import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import type { CustomProject } from '@/types/storage'

import { filterCustomProjectsByQuery } from './custom-project-search'

const asUseCase = (fn: ReturnType<typeof vi.fn>): GetProjectUrlsUseCase =>
  fn as unknown as GetProjectUrlsUseCase

const createProjects = (): CustomProject[] => [
  {
    id: 'project-1',
    name: 'Reading List',
    urlIds: ['url-1', 'url-2'],
    urlMetadata: {
      'url-1': { category: 'Later' },
      'url-2': { category: 'Watch' },
    },
    categories: ['Later', 'Watch'],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'project-2',
    name: 'Work',
    urlIds: ['url-3'],
    categories: [],
    createdAt: 2,
    updatedAt: 2,
  },
]

describe('filterCustomProjectsByQuery', () => {
  it('検索語が空なら元のプロジェクト配列を返す', async () => {
    const projects = createProjects()

    const result = await filterCustomProjectsByQuery({
      customProjects: projects,
      searchQuery: '  ',
      loadProjectUrls: asUseCase(vi.fn()),
    })

    expect(result).toBe(projects)
  })

  it('プロジェクト名一致は URL 解決なしでそのまま返す', async () => {
    const projects = createProjects()
    const loadProjectUrls = vi.fn()

    const result = await filterCustomProjectsByQuery({
      customProjects: projects,
      searchQuery: 'Reading',
      loadProjectUrls: asUseCase(loadProjectUrls),
    })

    expect(result).toStrictEqual([projects[0]])
    expect(loadProjectUrls).toHaveBeenCalledTimes(1)
    expect(loadProjectUrls).toHaveBeenCalledWith(projects[1])
  })

  it('urlIds ベースの URL タイトル一致で対象プロジェクトと一致 URL だけを返す', async () => {
    const projects = createProjects()

    const loadProjectUrls = vi.fn(async (project: CustomProject) => {
      if (project.id === 'project-1') {
        return [
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
        ]
      }

      return [
        {
          id: 'url-3',
          url: 'https://work.example.com',
          title: 'Meeting notes',
          savedAt: 12,
        },
      ]
    })

    const result = await filterCustomProjectsByQuery({
      customProjects: projects,
      searchQuery: 'docker',
      loadProjectUrls,
    })

    expect(result).toStrictEqual([
      {
        ...projects[0],
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': { category: 'Later' },
        },
        urls: [
          {
            url: 'https://example.com/docker-cmd',
            title: 'Docker CMD',
            savedAt: 10,
            category: 'Later',
            notes: undefined,
          },
        ],
      },
    ])
  })

  it('検索結果に同じ URL が複数回出ても一件にまとめる', async () => {
    const project: CustomProject = {
      id: 'project-duplicate-url',
      name: 'Duplicate URL',
      categories: [],
      createdAt: 1,
      updatedAt: 1,
    }

    const result = await filterCustomProjectsByQuery({
      customProjects: [project],
      searchQuery: 'react',

      loadProjectUrls: vi.fn(async () => [
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
      ]),
    })

    expect(result[0]?.urls).toStrictEqual([
      {
        category: undefined,
        notes: undefined,
        savedAt: 1,
        title: 'React Guide',
        url: 'https://example.com/react',
      },
    ])
  })
})
