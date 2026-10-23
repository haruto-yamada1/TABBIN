import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSavedTabsUseCasesStub } from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import { showOpenedUrlsUndoToast } from '@/contexts/saved-tabs/presentation/app/savedTabsApp.helpers'

import { useSelectedSavedTabsDeletion } from './useSelectedSavedTabsDeletion'

vi.mock('@/contexts/saved-tabs/presentation/app/savedTabsApp.helpers', () => ({
  showOpenedUrlsUndoToast: vi.fn(),
}))
const { errorToast } = vi.hoisted(() => ({ errorToast: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: errorToast } }))

const items = [
  { groupId: 'a', url: 'https://a.example/1', title: 'A' },
  { groupId: 'b', url: 'https://b.example/2', title: 'B' },
  { groupId: 'a', url: 'https://a.example/3', title: 'C' },
]
const snapshot = { savedTabs: [], customProjects: [], urlRecords: [] }
const setup = (
  deleteSelectedSavedUrls = vi
    .fn()
    .mockResolvedValue({ removedCount: 3, snapshot }),
  refresh = vi.fn().mockResolvedValue([]),
) => {
  const deps = {
    savedTabsUseCases: createSavedTabsUseCasesStub({
      deleteSelectedSavedUrls,
      restoreOpenedUrlsSnapshotView: vi.fn(),
    }),
    refreshTabGroupsWithUrls: refresh,
    setCustomProjects: vi.fn(),
    setCategories: vi.fn(),
    t: (key: string) => key,
  }
  const hook = renderHook(() => useSelectedSavedTabsDeletion(deps))
  return { ...hook, deleteSelectedSavedUrls, refresh, deps }
}

beforeEach(() => vi.clearAllMocks())

describe('selected saved tabs deletion', () => {
  it('deletes all selected groups once and offers the committed snapshot as one Undo', async () => {
    const { result, deleteSelectedSavedUrls, refresh, deps } = setup()
    await expect(result.current(items)).resolves.toBeUndefined()
    expect(deleteSelectedSavedUrls).toHaveBeenCalledExactlyOnceWith({
      targets: [
        {
          tabGroupId: 'a',
          urls: ['https://a.example/1', 'https://a.example/3'],
        },
        { tabGroupId: 'b', urls: ['https://b.example/2'] },
      ],
    })
    expect(showOpenedUrlsUndoToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        count: 3,
        messageKey: 'savedTabs.undo.deletedTabs',
        snapshot,
        refreshTabGroupsWithUrls: refresh,
        setCategories: deps.setCategories,
        setCustomProjects: deps.setCustomProjects,
        t: deps.t,
      }),
    )
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('propagates an atomic failure without Undo, refresh, or a stale snapshot restore', async () => {
    const failure = new Error('revision conflict')
    const { result, deps, refresh } = setup(vi.fn().mockRejectedValue(failure))
    await expect(result.current(items)).rejects.toBe(failure)
    expect(showOpenedUrlsUndoToast).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(
      deps.savedTabsUseCases.restoreOpenedUrlsSnapshotView,
    ).not.toHaveBeenCalled()
    expect(errorToast).not.toHaveBeenCalled()
  })

  it('preserves committed success and Undo if only refreshing the display fails', async () => {
    const { result } = setup(
      undefined,
      vi.fn().mockRejectedValue(new Error('query failed')),
    )
    await expect(result.current(items)).resolves.toBeUndefined()
    expect(showOpenedUrlsUndoToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith('savedTabs.selection.refreshFailed')
  })

  it('does nothing for an empty selection or a no-op result', async () => {
    const { result, deleteSelectedSavedUrls } = setup(
      vi.fn().mockResolvedValue({ removedCount: 0, snapshot: null }),
    )
    await result.current([])
    expect(deleteSelectedSavedUrls).not.toHaveBeenCalled()
    await result.current(items)
    expect(showOpenedUrlsUndoToast).not.toHaveBeenCalled()
  })
})
