import type { DragEndEvent } from '@dnd-kit/core'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  GetProjectUrlsUseCase,
  ProjectUrlEntry,
} from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import { useCustomProjectCard } from './useCustomProjectCard'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ language: 'en', t: (key: string) => key }),
}))

const project: CustomProject = {
  id: 'project-1',
  name: 'Research',
  categories: [],
  memberships: [{ urlId: 'one' }, { urlId: 'two' }],
  createdAt: 1,
  updatedAt: 1,
}
const urls: ProjectUrlEntry[] = ['one', 'two'].map((id) => ({
  id,
  url: `https://example.com/${id}`,
  title: id,
  savedAt: 1,
}))

describe('useCustomProjectCard loading targets', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('marks a changed project projection as loading until its own URLs resolve', async () => {
    const first = Promise.withResolvers<ProjectUrlEntry[]>()
    const filtered = Promise.withResolvers<ProjectUrlEntry[]>()
    const getProjectUrlsUseCase = vi
      .fn<GetProjectUrlsUseCase>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(filtered.promise)
    const { result, rerender } = renderHook(
      ({ currentProject }) =>
        useCustomProjectCard({
          project: currentProject,
          getProjectUrlsUseCase,
          handleDeleteUrl: vi.fn(),
          handleSetUrlCategory: vi.fn(),
          handleUpdateCategoryOrder: vi.fn(),
          handleReorderUrls: vi.fn(),
        }),
      { initialProps: { currentProject: project } },
    )
    expect(result.current.urls.isLoadingUrls).toBe(true)
    await act(async () => {
      first.resolve(urls)
      await first.promise
    })
    expect(result.current.urls.isLoadingUrls).toBe(false)
    expect(result.current.urls.projectUrls).toEqual(urls)

    rerender({
      currentProject: { ...project, memberships: [{ urlId: 'two' }] },
    })
    expect(result.current.urls.isLoadingUrls).toBe(true)
    await act(async () => {
      filtered.resolve(urls.slice(1))
      await filtered.promise
    })
    expect(result.current.urls.isLoadingUrls).toBe(false)
    expect(result.current.urls.projectUrls).toEqual(urls.slice(1))
  })
})

const renderProjectHook = (getProjectUrlsUseCase: GetProjectUrlsUseCase) => {
  const handlers = {
    handleDeleteUrl: vi.fn(),
    handleSetUrlCategory: vi.fn(),
    handleUpdateCategoryOrder: vi.fn(),
    handleReorderUrls: vi.fn(),
  }
  return {
    ...renderHook(
      ({ currentProject }) =>
        useCustomProjectCard({
          project: currentProject,
          getProjectUrlsUseCase,
          ...handlers,
        }),
      { initialProps: { currentProject: project } },
    ),
    handlers,
  }
}

const createUrlDrag = (
  sourceCategory?: string,
  targetCategory?: string,
): DragEndEvent => ({
  activatorEvent: new KeyboardEvent('keydown'),
  active: {
    id: 'one',
    data: {
      current: { type: 'url', url: urls[0]?.url, category: sourceCategory },
    },
    rect: { current: { initial: null, translated: null } },
  },
  collisions: null,
  delta: { x: 0, y: 0 },
  over: {
    id: urls[1]?.url ?? '',
    disabled: false,
    rect: { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 },
    data: { current: { type: 'url', category: targetCategory } },
  },
})

describe('useCustomProjectCard resolved target lifecycle', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('ignores an older read while the filtered projection is still loading', async () => {
    const first = Promise.withResolvers<ProjectUrlEntry[]>()
    const filtered = Promise.withResolvers<ProjectUrlEntry[]>()
    const query = vi
      .fn<GetProjectUrlsUseCase>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(filtered.promise)
    const { result, rerender } = renderProjectHook(query)
    rerender({
      currentProject: { ...project, memberships: [{ urlId: 'two' }] },
    })
    await act(async () => {
      first.resolve(urls)
      await first.promise
    })
    expect(result.current.urls.isLoadingUrls).toBe(true)
    expect(result.current.urls.projectUrls).toEqual([])
    await act(async () => {
      filtered.resolve(urls.slice(1))
      await filtered.promise
    })
    expect(result.current.urls.isLoadingUrls).toBe(false)
    expect(result.current.urls.projectUrls).toEqual(urls.slice(1))
  })

  it('clears the old target set when the current read fails', async () => {
    const failure = new Error('fixture read failure')
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const query = vi
      .fn<GetProjectUrlsUseCase>()
      .mockResolvedValueOnce(urls)
      .mockRejectedValueOnce(failure)
    const { result, rerender } = renderProjectHook(query)
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    rerender({ currentProject: { ...project, updatedAt: 2 } })
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    expect(result.current.urls.projectUrls).toEqual([])
    expect(logError).toHaveBeenCalledWith(
      'プロジェクトURLの取得エラー:',
      failure,
    )
  })

  it('preserves the resolved projection and URL set after a local reorder', async () => {
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(urls),
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    act(() => result.current.dnd.handleUrlDragEnd(createUrlDrag(), false))
    expect(result.current.urls.isLoadingUrls).toBe(false)
    expect(result.current.urls.projectUrls).toEqual(urls.toReversed())
    expect(handlers.handleReorderUrls).toHaveBeenCalledExactlyOnceWith(
      project.id,
      urls.toReversed(),
    )
    expect(handlers.handleSetUrlCategory).not.toHaveBeenCalled()
  })

  it('preserves the resolved projection when a URL moves to another category', async () => {
    const categorizedUrls = urls.map((url) => ({ ...url, category: 'Old' }))
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(categorizedUrls),
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    act(() =>
      result.current.dnd.handleUrlDragEnd(createUrlDrag('Old', 'New'), false),
    )
    expect(result.current.urls.isLoadingUrls).toBe(false)
    expect(result.current.urls.projectUrls).toEqual([
      { ...categorizedUrls[0], category: 'New' },
      categorizedUrls[1],
    ])
    expect(handlers.handleSetUrlCategory).toHaveBeenCalledExactlyOnceWith(
      project.id,
      urls[0]?.url,
      'New',
    )
    expect(handlers.handleReorderUrls).not.toHaveBeenCalled()
  })
})
