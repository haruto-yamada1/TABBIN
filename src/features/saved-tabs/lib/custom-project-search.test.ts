import { describe, expect, it, vi } from 'vitest'

import type { CustomProject } from '@/types/storage'

import { filterCustomProjectsByQuery } from './custom-project-search'

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
      loadProjectUrls: vi.fn(),
    })

    expect(result).toBe(projects)
  })

  it('プロジェクト名一致は URL 解決なしでそのまま返す', async () => {
    const projects = createProjects()
    const loadProjectUrls = vi.fn()

    const result = await filterCustomProjectsByQuery({
      customProjects: projects,
      searchQuery: 'Reading',
      loadProjectUrls,
    })

    expect(result).toEqual([projects[0]])
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

    expect(result).toEqual([
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
})
