import type { DragEndEvent } from '@dnd-kit/core'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
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

const renderProjectHook = (
  getProjectUrlsUseCase: GetProjectUrlsUseCase,
  initialProject: CustomProject = project,
) => {
  const handlers = {
    handleDeleteUrl: vi.fn(),
    handleSetUrlCategory: vi.fn<(...args: unknown[]) => void | Promise<void>>(),
    handleUpdateCategoryOrder:
      vi.fn<(...args: unknown[]) => void | Promise<void>>(),
    handleReorderUrls: vi.fn<(...args: unknown[]) => void | Promise<void>>(),
  }
  return {
    ...renderHook(
      ({ currentProject }) =>
        useCustomProjectCard({
          project: currentProject,
          getProjectUrlsUseCase,
          ...handlers,
        }),
      { initialProps: { currentProject: initialProject } },
    ),
    handlers,
  }
}

type UrlDragEvent = DragEndEvent & {
  over: NonNullable<DragEndEvent['over']>
}

const createUrlDrag = (
  sourceCategory?: string,
  targetCategory?: string,
): UrlDragEvent => ({
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
    await act(async () => {
      await result.current.dnd.handleUrlDragEnd(createUrlDrag(), false)
    })
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
    await act(async () => {
      await result.current.dnd.handleUrlDragEnd(
        createUrlDrag('Old', 'New'),
        false,
      )
    })
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

const createCategoryDrag = (): UrlDragEvent => {
  const event = createUrlDrag()
  return {
    ...event,
    active: {
      ...event.active,
      id: 'First',
      data: { current: { type: 'category' } },
    },
    over: {
      ...event.over,
      id: 'Second',
      data: {
        current: {
          type: 'category',
          categoryName: 'Second',
          projectId: project.id,
        },
      },
    },
  }
}

describe('useCustomProjectCard grouped target lifecycle', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps the loaded URL order and withholds success while saving is pending or fails', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const success = vi.spyOn(toast, 'success')
    const saved = Promise.withResolvers<undefined>()
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(urls),
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    handlers.handleReorderUrls.mockReturnValue(saved.promise)
    let drop = Promise.resolve()
    act(() => {
      drop = result.current.dnd.handleUrlDragEnd(createUrlDrag(), false)
    })
    expect(result.current.urls.projectUrls).toEqual(urls)
    expect(success).not.toHaveBeenCalled()
    await act(async () => {
      saved.reject(new Error('storage unavailable'))
      await drop
    })
    expect(result.current.urls.projectUrls).toEqual(urls)
    expect(success).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalled()
  })

  it('keeps the original URL category when a category move fails', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const success = vi.spyOn(toast, 'success')
    const categorized = urls.map((url) => ({ ...url, category: 'First' }))
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(categorized),
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    handlers.handleSetUrlCategory.mockRejectedValue(
      new Error('storage unavailable'),
    )
    await act(async () => {
      await result.current.dnd.handleUrlDragEnd(
        createUrlDrag('First', 'Second'),
        false,
      )
    })
    expect(result.current.urls.projectUrls).toEqual(categorized)
    expect(success).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalled()
  })

  it('clears category drag state and withholds success if its order cannot be saved', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const success = vi.spyOn(toast, 'success')
    const currentProject = { ...project, categories: ['First', 'Second'] }
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(urls),
      currentProject,
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    handlers.handleUpdateCategoryOrder.mockRejectedValue(
      new Error('storage unavailable'),
    )
    const drag = createCategoryDrag()
    act(() => result.current.dnd.handleDragStart(drag))
    await act(async () => {
      await result.current.dnd.handleCategoryDragEnd(drag)
    })
    expect(result.current.dnd.isDraggingCategory).toBe(false)
    expect(result.current.dnd.draggedCategoryName).toBeNull()
    expect(success).not.toHaveBeenCalled()
    expect(logError).toHaveBeenCalled()
  })

  it.each([
    { label: 'category list', order: undefined, expected: ['Second', 'First'] },
    {
      label: 'saved order',
      order: ['Second', 'First'],
      expected: ['First', 'Second'],
    },
  ])(
    'retains loaded URLs when categories are reordered from the $label',
    async ({ order, expected }) => {
      const currentProject: CustomProject = {
        ...project,
        categories: ['First', 'Second'],
        ...(order !== undefined ? { categoryOrder: order } : {}),
      }
      const { result, handlers } = renderProjectHook(
        vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(urls),
        currentProject,
      )
      await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
      const drag = createCategoryDrag()
      act(() => result.current.dnd.handleDragStart(drag))
      expect(result.current.dnd.isDraggingCategory).toBe(true)
      act(() => result.current.dnd.handleDragOver(drag, currentProject))
      expect(result.current.dnd.draggedOverCategory).toBe('Second')
      await act(async () => {
        await result.current.dnd.handleCategoryDragEnd(drag)
      })
      expect(
        handlers.handleUpdateCategoryOrder,
      ).toHaveBeenCalledExactlyOnceWith(project.id, expected)
      expect(result.current.urls.projectUrls).toEqual(urls)
      expect(result.current.urls.isLoadingUrls).toBe(false)
      expect(result.current.dnd.isDraggingCategory).toBe(false)
      expect(result.current.dnd.activeId).toBeNull()
      expect(result.current.dnd.draggedOverCategory).toBeNull()
    },
  )

  it('clears category drag state across project boundaries and when a URL drag starts', async () => {
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(urls),
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    const categoryDrag = createCategoryDrag()
    act(() => result.current.dnd.handleDragStart(createUrlDrag()))
    act(() => result.current.dnd.handleDragStart(categoryDrag))
    act(() => result.current.dnd.handleDragOver(categoryDrag, project))
    expect(result.current.dnd.draggedOverCategory).toBe('Second')
    act(() =>
      result.current.dnd.handleDragOver(
        {
          ...categoryDrag,
          over: {
            ...categoryDrag.over,
            data: {
              current: {
                type: 'category',
                categoryName: 'Other',
                projectId: 'other-project',
              },
            },
          },
        },
        project,
      ),
    )
    expect(result.current.dnd.draggedOverCategory).toBeNull()
    act(() =>
      result.current.dnd.handleDragOver(
        createUrlDrag(undefined, 'Second'),
        project,
      ),
    )
    expect(result.current.dnd.draggedOverCategory).toBe('Second')
    act(() => result.current.dnd.handleDragStart(createUrlDrag()))
    expect(result.current.dnd.isDraggingCategory).toBe(false)
    expect(result.current.dnd.activeId).toBeNull()
    expect(result.current.dnd.draggedCategoryName).toBeNull()
    expect(result.current.dnd.draggedOverCategory).toBeNull()
    expect(result.current.urls.isLoadingUrls).toBe(false)
    expect(result.current.urls.projectUrls).toEqual(urls)
    expect(handlers.handleSetUrlCategory).not.toHaveBeenCalled()
    expect(handlers.handleReorderUrls).not.toHaveBeenCalled()
  })

  it('retains loaded targets and makes no changes when a URL drop is cancelled', async () => {
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(urls),
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    await act(async () => {
      await result.current.dnd.handleUrlDragEnd(
        { ...createUrlDrag(), over: null },
        false,
      )
    })
    expect(result.current.urls.isLoadingUrls).toBe(false)
    expect(result.current.urls.projectUrls).toEqual(urls)
    expect(handlers.handleReorderUrls).not.toHaveBeenCalled()
    expect(handlers.handleSetUrlCategory).not.toHaveBeenCalled()
  })

  it('uses URL data when the sortable ID identifies a project membership', async () => {
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(urls),
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    const drag = createUrlDrag()
    await act(async () => {
      await result.current.dnd.handleUrlDragEnd(
        {
          ...drag,
          over: {
            ...drag.over,
            id: 'membership-in-project',
            data: { current: { type: 'url', url: urls[1]?.url } },
          },
        },
        false,
      )
    })
    expect(handlers.handleReorderUrls).toHaveBeenCalledWith(project.id, [
      urls[1],
      urls[0],
    ])
  })

  it('uses category data for scoped sortable IDs and keeps another project untouched', async () => {
    const currentProject = { ...project, categories: ['First', 'Second'] }
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(urls),
      currentProject,
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    const base = createCategoryDrag()
    const drag = {
      ...base,
      active: {
        ...base.active,
        id: 'scoped-first',
        data: {
          current: {
            type: 'category',
            categoryName: 'First',
            projectId: project.id,
          },
        },
      },
      over: { ...base.over, id: 'scoped-second' },
    }
    act(() => result.current.dnd.handleDragStart(drag))
    expect(result.current.dnd.draggedCategoryName).toBe('First')
    await act(async () => {
      await result.current.dnd.handleCategoryDragEnd(drag)
    })
    expect(handlers.handleUpdateCategoryOrder).toHaveBeenCalledWith(
      project.id,
      ['Second', 'First'],
    )
  })

  it('retains the loaded projection and target set when a URL becomes uncategorized', async () => {
    const categorizedUrls = urls.map((url, index) =>
      index === 0 ? { ...url, category: 'Old' } : url,
    )
    const { result, handlers } = renderProjectHook(
      vi.fn<GetProjectUrlsUseCase>().mockResolvedValue(categorizedUrls),
      { ...project, categories: ['Old'] },
    )
    await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
    await act(async () => {
      await result.current.dnd.handleUrlDragEnd(createUrlDrag('Old'), false)
    })
    expect(result.current.urls.isLoadingUrls).toBe(false)
    expect(result.current.urls.projectUrls).toEqual(urls)
    expect(handlers.handleSetUrlCategory).toHaveBeenCalledExactlyOnceWith(
      project.id,
      urls[0]?.url,
      undefined,
    )
    expect(handlers.handleReorderUrls).not.toHaveBeenCalled()
  })
})

it('日時ソート表示中はURLの保存済み手動順を変更しない', async () => {
  const handleReorderUrls = vi.fn()
  const getProjectUrlsUseCase = vi
    .fn<GetProjectUrlsUseCase>()
    .mockResolvedValue(urls)
  const { result } = renderHook(() =>
    useCustomProjectCard({
      project,
      getProjectUrlsUseCase,
      handleReorderUrls,
      allowUrlReorder: false,
      handleDeleteUrl: vi.fn(),
      handleSetUrlCategory: vi.fn(),
      handleUpdateCategoryOrder: vi.fn(),
    }),
  )
  await waitFor(() => expect(result.current.urls.isLoadingUrls).toBe(false))
  await act(async () => {
    await result.current.dnd.handleUrlDragEnd(createUrlDrag(), false)
  })
  expect(handleReorderUrls).not.toHaveBeenCalled()
  expect(result.current.urls.projectUrls).toEqual(urls)
})
