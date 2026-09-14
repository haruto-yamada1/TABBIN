import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import { useProjectCategoryHandlers } from './useProjectCategoryHandlers'

describe('useProjectCategoryHandlers', () => {
  it('URL並べ替え後は authoritative memberships の順序で state を更新する', async () => {
    const initialProject: CustomProject = {
      categories: [],
      createdAt: 1,
      id: 'project-1',
      memberships: [
        { urlId: 'url-orphan' },
        { urlId: 'url-a' },
        { urlId: 'url-b' },
      ],
      name: 'Project',
      updatedAt: 2,
    }
    const reorderCustomProjectUrls = vi.fn().mockResolvedValue(undefined)
    const refs = {
      reorderCustomProjectUrlsUseCaseRef: {
        current: reorderCustomProjectUrls,
      },
    } as never
    const { result } = renderHook(() => {
      const [projects, setProjects] = useState<CustomProject[]>([
        initialProject,
      ])
      const handlers = useProjectCategoryHandlers({
        refs,
        setCustomProjects: setProjects,
        t: (key) => key,
      })
      return { ...handlers, projects }
    })

    await act(async () => {
      await result.current.handleReorderUrls('project-1', [
        {
          id: 'url-b',
          savedAt: 2,
          title: 'B',
          url: 'https://example.com/b',
        },
        {
          id: 'url-a',
          savedAt: 1,
          title: 'A',
          url: 'https://example.com/a',
        },
      ])
    })

    expect(reorderCustomProjectUrls).toHaveBeenCalledWith({
      projectId: 'project-1',
      urls: [
        {
          id: 'url-b',
          savedAt: 2,
          title: 'B',
          url: 'https://example.com/b',
        },
        {
          id: 'url-a',
          savedAt: 1,
          title: 'A',
          url: 'https://example.com/a',
        },
      ],
    })
    expect(
      result.current.projects[0]?.memberships?.map(({ urlId }) => urlId),
    ).toStrictEqual(['url-b', 'url-a', 'url-orphan'])
  })
})
