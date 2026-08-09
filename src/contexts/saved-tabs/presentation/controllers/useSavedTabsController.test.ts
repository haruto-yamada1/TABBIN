// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsCustomProjectDto as createCurrentCustomProject,
  createSavedTabsParentCategoryDto,
  createSavedTabsTabGroupDto as createCurrentTabGroup,
  createSavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import {
  toSavedTabsCustomProjectViewModel,
  toSavedTabsTabGroupViewModel,
} from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'

import { useSavedTabsController } from './useSavedTabsController'

afterEach(() => vi.restoreAllMocks())

const currentGroup = createCurrentTabGroup({
  domain: 'example.com',
  id: 'group-1',
  memberships: ['url-1'].map((urlId) => ({ urlId })),
})
const group = toSavedTabsTabGroupViewModel(currentGroup)
const currentProject = createCurrentCustomProject({
  id: 'project-1',
  name: 'Reading',
  memberships: ['url-1'].map((urlId) => ({ urlId })),
})
const project = toSavedTabsCustomProjectViewModel(currentProject)
const record = createSavedTabsUrlRecordDto({
  id: 'url-1',
  url: 'https://example.com/article',
})

const setup = (options: { initial?: boolean } = {}) => {
  let groups = [currentGroup]
  let projects = [currentProject]
  const open = vi.fn(async ({ url }: { url: string }) => ({ url }))
  const getSavedTabs = vi.fn(async () => groups)
  const getCustomProjects = vi.fn(async () => projects)
  const restoreOpenedUrlsSnapshot = vi.fn(async ({ snapshot }) => {
    groups = [...(snapshot.savedTabs ?? groups)]
    projects = [...(snapshot.customProjects ?? projects)]
    return {
      restoredCustomProjects: snapshot.customProjects ?? [],
      restoredParentCategories: snapshot.parentCategories ?? [],
      restoredTabGroups: snapshot.savedTabs ?? [],
      restoredUrlRecords: snapshot.urlRecords ?? [],
    }
  })
  const deps = createSavedTabsPresentationPortsStub({
    browserTabPort: { open },
  })
  const useCases = createSavedTabsUseCasesStub({
    deleteTabGroup: vi.fn(async ({ tabGroupId }) => {
      const removed = groups.find((entry) => entry.id === tabGroupId)
      if (!removed) {
        throw new Error('Tab group not found')
      }
      groups = groups.filter((entry) => entry.id !== tabGroupId)
      return {
        removedTabGroupId: tabGroupId,
        removedUrlRecordIds: [],
        snapshot: { savedTabs: [removed] },
      }
    }),
    getCustomProjects,
    getSavedTabs,
    openSavedUrl: vi.fn(async ({ urlRecordId }) => {
      if (urlRecordId !== record.id) {
        throw new Error('URL not found')
      }
      const opened = await open({ url: record.url })
      return {
        openedUrl: opened.url,
        removedUrlRecord: null,
        removedUrlRecordId: null,
        snapshot: null,
      }
    }),
    removeUnreferencedUrlRecords: vi.fn(async () => ({
      removedCount: 0,
      removedUrlRecordIds: [],
    })),
    restoreOpenedUrlsSnapshot,
    syncCategoryAssignments: vi.fn(async () => ({
      assignedTabGroupIds: [],
      unassignedTabGroupIds: [],
      updatedCategoryIds: [],
    })),
  })
  const hook = renderHook(() =>
    useSavedTabsController({
      deps,
      ...(options.initial
        ? { initialCustomProjects: [project], initialTabGroups: [group] }
        : {}),
      useCases,
    }),
  )
  return {
    ...hook,
    getCustomProjects,
    getSavedTabs,
    open,
    restoreOpenedUrlsSnapshot,
    useCases,
  }
}

describe('useSavedTabsController', () => {
  it('initial application DTO を view-model に変換する', () => {
    const { result } = setup({ initial: true })
    expect(result.current.viewModel.loading).toBe(false)
    expect(result.current.viewModel.tabGroups).toHaveLength(1)
    expect(result.current.viewModel.customProjects).toHaveLength(1)
  })

  it('refresh は application query から表示データを取得する', async () => {
    const { result, getSavedTabs, getCustomProjects } = setup()
    await act(async () => {
      await result.current.refresh()
    })
    expect(getSavedTabs).toHaveBeenCalledOnce()
    expect(getCustomProjects).toHaveBeenCalledOnce()
    expect(result.current.viewModel.hasContent).toBe(true)
  })

  it('openSavedUrl は primitive command を use-case に渡す', async () => {
    const { result, open, useCases } = setup({ initial: true })
    await act(async () => {
      await result.current.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: record.id,
      })
    })
    expect(useCases.openSavedUrl).toHaveBeenCalledWith({
      origin: 'click',
      settings: {
        removeTabAfterExternalDrop: false,
        removeTabAfterOpen: false,
      },
      urlRecordId: 'url-1',
    })
    expect(open).toHaveBeenCalledWith({ url: record.url })
  })

  it('deleteTabGroup 後に application query から再読込する', async () => {
    const { result } = setup({ initial: true })
    await act(async () => {
      await result.current.deleteTabGroup({ tabGroupId: group.id })
    })
    expect(result.current.viewModel.tabGroups).toHaveLength(0)
  })

  it('application DTO snapshot を変換せず restore use-case へ渡す', async () => {
    const { result, restoreOpenedUrlsSnapshot } = setup({ initial: true })
    const category = createSavedTabsParentCategoryDto({
      id: 'category-1',
      name: 'Docs',
    })
    const snapshot = {
      customProjects: [currentProject],
      parentCategories: [category],
      savedTabs: [currentGroup],
      urlRecords: [record],
    }
    let summary:
      | Awaited<ReturnType<typeof result.current.restoreOpenedUrlsSnapshot>>
      | undefined
    await act(async () => {
      summary = await result.current.restoreOpenedUrlsSnapshot({ snapshot })
    })
    expect(restoreOpenedUrlsSnapshot).toHaveBeenCalledWith({ snapshot })
    expect(summary?.restoredTabGroupCount).toBe(1)
    expect(summary?.restoredUrlRecordCount).toBe(1)
  })

  it('sync と cleanup の application DTO を集計する', async () => {
    const { result } = setup({ initial: true })
    let syncSummary:
      | Awaited<ReturnType<typeof result.current.syncCategoryAssignments>>
      | undefined
    let cleanupSummary:
      | Awaited<ReturnType<typeof result.current.removeUnreferencedUrlRecords>>
      | undefined
    await act(async () => {
      syncSummary = await result.current.syncCategoryAssignments({
        command: { domain: 'example.com', parentCategoryId: 'category-1' },
      })
      cleanupSummary = await result.current.removeUnreferencedUrlRecords()
    })
    expect(syncSummary?.assignedTabGroupCount).toBe(0)
    expect(cleanupSummary?.removedCount).toBe(0)
  })

  it('use-case の失敗を error view-model に反映して再 throw する', async () => {
    const { result, useCases } = setup({ initial: true })
    vi.mocked(useCases.openSavedUrl).mockRejectedValueOnce(new Error('failed'))
    let thrown: unknown
    await act(async () => {
      try {
        await result.current.openSavedUrl({
          origin: 'click',
          settings: {
            removeTabAfterExternalDrop: false,
            removeTabAfterOpen: false,
          },
          urlRecordId: record.id,
        })
      } catch (error) {
        thrown = error
      }
    })
    expect(thrown).toEqual(new Error('failed'))
    expect(result.current.viewModel.error).toBe('failed')
  })

  it('refresh の非 Error 失敗を文字列化し loading を解除する', async () => {
    const { result, getSavedTabs } = setup({ initial: true })
    getSavedTabs.mockRejectedValueOnce('refresh failed')

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.viewModel.error).toBe('refresh failed')
    expect(result.current.viewModel.loading).toBe(false)
  })

  it('openSavedUrl の full/empty snapshot を安全にコピーする', async () => {
    const { result, useCases } = setup({ initial: true })
    const category = createSavedTabsParentCategoryDto({
      collections: ['group-1'].map((id, index) => ({
        id,
        domain: ['example.com'][index] ?? id,
      })),
      id: 'category-1',
      name: 'Docs',
    })
    const fullSnapshot = {
      customProjects: [currentProject],
      parentCategories: [category],
      savedTabs: [currentGroup],
      urlRecords: [record],
    }
    vi.mocked(useCases.openSavedUrl)
      .mockResolvedValueOnce({
        openedUrl: record.url,
        removedUrlRecord: record,
        removedUrlRecordId: record.id,
        snapshot: fullSnapshot,
      })
      .mockResolvedValueOnce({
        openedUrl: record.url,
        removedUrlRecord: null,
        removedUrlRecordId: null,
        snapshot: {},
      })

    await act(async () => {
      await result.current.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: true,
        },
        urlRecordId: record.id,
      })
      await result.current.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: true,
        },
        urlRecordId: record.id,
      })
    })

    expect(useCases.openSavedUrl).toHaveBeenCalledTimes(2)
  })

  it('deleteTabGroup の full/empty snapshot を安全にコピーする', async () => {
    const { result, useCases } = setup({ initial: true })
    const category = createSavedTabsParentCategoryDto({
      collections: ['group-1'].map((id, index) => ({
        id,
        domain: ['example.com'][index] ?? id,
      })),
      id: 'category-1',
      name: 'Docs',
    })
    vi.mocked(useCases.deleteTabGroup)
      .mockResolvedValueOnce({
        removedTabGroupId: group.id,
        removedUrlRecordIds: [record.id],
        snapshot: {
          customProjects: [currentProject],
          parentCategories: [category],
          savedTabs: [currentGroup],
          urlRecords: [record],
        },
      })
      .mockResolvedValueOnce({
        removedTabGroupId: group.id,
        removedUrlRecordIds: [],
        snapshot: {},
      })

    await act(async () => {
      await result.current.deleteTabGroup({ tabGroupId: group.id })
      await result.current.deleteTabGroup({ tabGroupId: group.id })
    })

    expect(useCases.deleteTabGroup).toHaveBeenCalledTimes(2)
  })

  it('syncCategoryAssignments は command 省略時に空 command を渡す', async () => {
    const { result, useCases } = setup({ initial: true })

    await act(async () => {
      await result.current.syncCategoryAssignments({})
    })

    expect(useCases.syncCategoryAssignments).toHaveBeenCalledWith({})
  })

  it.each([
    ['deleteTabGroup', new Error('delete failed')],
    ['deleteTabGroup', 'delete string failed'],
    ['restoreOpenedUrlsSnapshot', new Error('restore failed')],
    ['restoreOpenedUrlsSnapshot', 'restore string failed'],
    ['syncCategoryAssignments', new Error('sync failed')],
    ['syncCategoryAssignments', 'sync string failed'],
    ['removeUnreferencedUrlRecords', new Error('cleanup failed')],
    ['removeUnreferencedUrlRecords', 'cleanup string failed'],
  ] as const)(
    '%s の失敗を error view-model に反映して再 throw する',
    async (operation, failure) => {
      const { result, useCases } = setup({ initial: true })
      vi.mocked(useCases[operation]).mockRejectedValueOnce(failure)
      let thrown: unknown

      await act(async () => {
        try {
          if (operation === 'deleteTabGroup') {
            await result.current.deleteTabGroup({ tabGroupId: group.id })
          } else if (operation === 'restoreOpenedUrlsSnapshot') {
            await result.current.restoreOpenedUrlsSnapshot({ snapshot: {} })
          } else if (operation === 'syncCategoryAssignments') {
            await result.current.syncCategoryAssignments({})
          } else {
            await result.current.removeUnreferencedUrlRecords()
          }
        } catch (error) {
          thrown = error
        }
      })

      expect(thrown).toBe(failure)
      expect(result.current.viewModel.error).toBe(
        failure instanceof Error ? failure.message : failure,
      )
    },
  )
})
