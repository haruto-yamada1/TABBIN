// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsCustomProjectDto,
  createSavedTabsParentCategoryDto,
  createSavedTabsTabGroupDto,
  createSavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'

import { useDomainModeController } from './useDomainModeController'
import { useSavedTabsController } from './useSavedTabsController'

afterEach(() => vi.restoreAllMocks())

const group = createSavedTabsTabGroupDto({
  domain: 'example.com',
  id: 'group-1',
  urlIds: ['url-1'],
})
const project = createSavedTabsCustomProjectDto({
  id: 'project-1',
  name: 'Reading',
})
const category = createSavedTabsParentCategoryDto({
  domainNames: ['example.com'],
  domains: ['group-1'],
  id: 'category-1',
  name: 'Docs',
})
const record = createSavedTabsUrlRecordDto({
  id: 'url-1',
  url: 'https://example.com/article',
})

const setup = (hasRecord = true, parentHasInitial = true) => {
  let groups = [group]
  const open = vi.fn(async ({ url }: { url: string }) => ({ url }))
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
    findUrlRecordByUrl: vi.fn(async () => ({
      record: hasRecord
        ? { id: record.id, title: record.title, url: record.url }
        : null,
    })),
    getCustomProjects: vi.fn(async () => [project]),
    getSavedTabs: vi.fn(async () => groups),
    openSavedUrl: vi.fn(async () => {
      const opened = await open({ url: record.url })
      return {
        openedUrl: opened.url,
        removedUrlRecord: null,
        removedUrlRecordId: null,
        snapshot: null,
      }
    }),
  })
  const hook = renderHook(() => {
    const controller = useSavedTabsController({
      deps,
      ...(parentHasInitial
        ? { initialCustomProjects: [project], initialTabGroups: groups }
        : {}),
      useCases,
    })
    return useDomainModeController({
      controller,
      initialCustomProjects: [project],
      initialParentCategories: [category],
      initialTabGroups: groups,
    })
  })
  return { ...hook, open }
}

describe('useDomainModeController', () => {
  it('application DTO を domain mode view-model に反映する', () => {
    const { result } = setup()
    expect(result.current.viewModel.tabGroups).toHaveLength(1)
    expect(result.current.categories[0]?.name).toBe('Docs')
  })

  it('カテゴリと検索クエリをローカル state へ反映する', () => {
    const { result } = setup()
    const next = createSavedTabsParentCategoryDto({ id: 'next', name: 'Next' })
    act(() => {
      result.current.setSearchQuery('example')
      result.current.setParentCategories([next])
    })
    expect(result.current.viewModel.searchQuery).toBe('example')
    expect(result.current.categories[0]?.id).toBe('next')
  })

  it('functional updater で親カテゴリ state を更新する', () => {
    const { result } = setup()
    const next = createSavedTabsParentCategoryDto({ id: 'next', name: 'Next' })

    act(() => {
      result.current.setParentCategories((previous) => [...previous, next])
    })

    expect(result.current.categories.map((entry) => entry.id)).toStrictEqual([
      'category-1',
      'next',
    ])
  })

  it('親 controller が空でも initial DTO から表示 view-model を構築する', () => {
    const { result } = setup(true, false)

    expect(result.current.tabGroups).toHaveLength(1)
    expect(result.current.customProjects).toHaveLength(1)
    expect(result.current.tabGroups[0]).toMatchObject({
      displayUrlCount: 1,
      hasUrls: true,
      subCategoryCount: 0,
      urls: [],
    })
  })

  it('保存済み URL は application use-case 経由で開く', async () => {
    const { result, open } = setup()
    await act(async () => {
      await result.current.openTab(record.url)
    })
    expect(open).toHaveBeenCalledWith({ url: record.url })
  })

  it('未保存 URL と複数 URL は BrowserTabPort 経由で開く', async () => {
    const { result, open } = setup(false)
    await act(async () => {
      await result.current.openTab('https://unknown.example')
      await result.current.openAllTabs(
        [
          { title: 'A', url: 'https://a.example' },
          { title: 'B', url: 'https://b.example' },
        ],
        { openAllInNewWindow: false, openUrlInBackground: false },
      )
    })
    expect(open).toHaveBeenCalledTimes(3)
  })

  it('空の一括 open は no-op、new-window option は各 URL を port で開く', async () => {
    const { result, open } = setup(false)
    await act(async () => {
      await result.current.openAllTabs([], {
        openAllInNewWindow: true,
        openUrlInBackground: false,
      })
      await result.current.openAllTabs(
        [
          { title: 'A', url: 'https://a.example' },
          { title: 'B', url: 'https://b.example' },
        ],
        { openAllInNewWindow: true, openUrlInBackground: true },
      )
    })

    expect(open).toHaveBeenCalledTimes(2)
  })

  it('deleteGroup を application use-case に委譲して再読込する', async () => {
    const { result } = setup()
    await act(async () => {
      await result.current.deleteGroup(group.id)
    })
    expect(result.current.viewModel.tabGroups).toHaveLength(0)
  })

  it('deleteGroups を application use-case に委譲する', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.deleteGroups([group.id])
    })

    expect(result.current.viewModel.tabGroups).toHaveLength(0)
  })
})
