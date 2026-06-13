// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrowserTabPort } from '../../application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '../../application/ports/BrowserWindowPort'
import type { NotificationPort } from '../../application/ports/NotificationPort'
import { createCustomProject } from '../../domain/entities/CustomProject'
import type { CustomProject } from '../../domain/entities/CustomProject'
import { createTabGroup } from '../../domain/entities/TabGroup'
import type { TabGroup } from '../../domain/entities/TabGroup'
import { createUrlRecord } from '../../domain/entities/UrlRecord'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { createSavedTabsUseCases } from '../../infrastructure/composition/createSavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'
import { useSavedTabsController } from './useSavedTabsController'

const createSampleTabGroup = (id: string, domain: string): TabGroup =>
  createTabGroup({
    domain,
    id,
    urlIds: [`url-${id}`],
  })

const createSampleCustomProject = (id: string, name: string): CustomProject =>
  createCustomProject({
    categories: [],
    createdAt: 1,
    id,
    name,
    updatedAt: 1,
    urlIds: [],
  })

interface InMemoryState {
  tabGroups: TabGroup[]
  customProjects: CustomProject[]
}

const createInMemoryRepositories = (initial: Partial<InMemoryState> = {}) => {
  const state: InMemoryState = {
    customProjects: [...(initial.customProjects ?? [])],
    tabGroups: [...(initial.tabGroups ?? [])],
  }
  const tabGroupRepository: TabGroupRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => state.tabGroups.map((group) => ({ ...group })),
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      state.tabGroups.find((group) => group.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      state.tabGroups = state.tabGroups.filter((group) => !idSet.has(group.id))
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (groups) => {
      state.tabGroups = groups.map((group) => ({ ...group }))
    },
  }
  const customProjectRepository: CustomProjectRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () =>
      state.customProjects.map((project) => ({ ...project })),
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      state.customProjects.find((project) => project.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      state.customProjects = state.customProjects.filter(
        (project) => !idSet.has(project.id),
      )
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (projects) => {
      state.customProjects = projects.map((project) => ({ ...project }))
    },
  }
  return { customProjectRepository, state, tabGroupRepository }
}

const createEmptyDeps = (
  initialUrlRecords: ReturnType<typeof createUrlRecord>[] = [],
): {
  deps: SavedTabsUseCasesDeps
  openSpy: ReturnType<typeof vi.fn>
  notifySpy: ReturnType<typeof vi.fn>
  urlRecords: ReturnType<typeof createUrlRecord>[]
} => {
  const urlRecords: ReturnType<typeof createUrlRecord>[] = [
    ...initialUrlRecords,
  ]
  const urlRecordRepository: UrlRecordRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => urlRecords.map((record) => ({ ...record })),
    // eslint-disable-next-line typescript/require-await
    findById: async (id) =>
      urlRecords.find((record) => record.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      for (let i = urlRecords.length - 1; i >= 0; i--) {
        if (idSet.has(urlRecords[i]?.id ?? '')) {
          urlRecords.splice(i, 1)
        }
      }
    },
    // eslint-disable-next-line typescript/require-await
    saveAll: async (records) => {
      urlRecords.splice(
        0,
        urlRecords.length,
        ...records.map((record) => ({ ...record })),
      )
    },
  }
  const parentCategoryRepository: ParentCategoryRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [],
    // eslint-disable-next-line typescript/require-await
    findById: async () => null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
  }
  const openSpy = vi.fn((input: { url: string }) =>
    Promise.resolve({ url: input.url }),
  )
  const browserTabPort: BrowserTabPort = { open: openSpy }
  const browserWindowPort: BrowserWindowPort = {
    // eslint-disable-next-line typescript/require-await
    openWithUrls: vi.fn(async (input) => ({
      urls: [...input.urls],
    })),
  }
  const notifySpy = vi.fn()
  const notificationPort: NotificationPort = {
    error: notifySpy,
    info: notifySpy,
    success: notifySpy,
  }
  return {
    deps: {
      browserTabPort,
      browserWindowPort,
      customProjectRepository:
        createInMemoryRepositories().customProjectRepository,
      notificationPort,
      parentCategoryRepository,
      tabGroupRepository: createInMemoryRepositories().tabGroupRepository,
      urlRecordRepository,
    },
    notifySpy,
    openSpy,
    urlRecords,
  }
}

const renderController = (input: {
  deps: SavedTabsUseCasesDeps
  initialTabGroups?: readonly TabGroup[]
  initialCustomProjects?: readonly CustomProject[]
  useCases?: ReturnType<typeof createSavedTabsUseCases>
}) => {
  const useCases = input.useCases ?? createSavedTabsUseCases(input.deps)
  return renderHook(() =>
    useSavedTabsController({
      deps: input.deps,
      initialCustomProjects: input.initialCustomProjects,
      initialTabGroups: input.initialTabGroups,
      useCases,
    }),
  )
}

describe('useSavedTabsController', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initialTabGroups / initialCustomProjects を渡すと view-model へ反映する', () => {
    const { deps } = createEmptyDeps()
    const groups = [createSampleTabGroup('g1', 'example.com')]
    const projects = [createSampleCustomProject('p1', 'Reading')]
    const { result } = renderController({
      deps,
      initialCustomProjects: projects,
      initialTabGroups: groups,
    })
    expect(result.current.viewModel.loading).toBe(false)
    expect(result.current.viewModel.tabGroups).toHaveLength(1)
    expect(result.current.viewModel.customProjects).toHaveLength(1)
    expect(result.current.viewModel.hasContent).toBe(true)
  })

  it('initial が無ければ refresh で view-model を構築する', async () => {
    const { deps } = createEmptyDeps()
    const groups = [createSampleTabGroup('g1', 'example.com')]
    const projects = [createSampleCustomProject('p1', 'Reading')]
    const inMemory = createInMemoryRepositories({
      customProjects: projects,
      tabGroups: groups,
    })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.viewModel.loading).toBe(false)
    expect(result.current.viewModel.tabGroups).toHaveLength(1)
    expect(result.current.viewModel.customProjects).toHaveLength(1)
  })

  it('openSavedUrl は use-case を呼び、refresh で最新を反映する', async () => {
    const urlRecord = createUrlRecord({
      id: 'url-g1',
      savedAt: 1,
      title: 'example article',
      url: 'https://example.com/article',
    })
    const { deps, openSpy } = createEmptyDeps([urlRecord])
    const group = createSampleTabGroup('g1', 'example.com')
    const inMemory = createInMemoryRepositories({ tabGroups: [group] })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      await result.current.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: 'url-g1',
      })
    })
    expect(openSpy).toHaveBeenCalledWith({ url: 'https://example.com/article' })
  })

  it('use-case 失敗時は error をセットし再 throw する', async () => {
    const { deps } = createEmptyDeps()
    const group = createSampleTabGroup('g1', 'example.com')
    const inMemory = createInMemoryRepositories({ tabGroups: [group] })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    // urlRecordRepository は空のため openSavedUrl は 'URL_RECORD_NOT_FOUND' で失敗する
    await act(async () => {
      await expect(
        result.current.openSavedUrl({
          origin: 'click',
          settings: {
            removeTabAfterExternalDrop: false,
            removeTabAfterOpen: false,
          },
          urlRecordId: 'url-missing',
        }),
      ).rejects.toThrow(/.*/)
    })
    expect(result.current.viewModel.error).not.toBeNull()
  })

  it('deleteTabGroup は use-case を呼んで repository から消す', async () => {
    const { deps } = createEmptyDeps()
    const group = createSampleTabGroup('g1', 'example.com')
    const inMemory = createInMemoryRepositories({ tabGroups: [group] })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      await result.current.deleteTabGroup({ tabGroupId: 'g1' })
    })
    expect(result.current.viewModel.tabGroups).toHaveLength(0)
  })

  it('restoreOpenedUrlsSnapshot は snapshot を受け取って use-case を呼ぶ', async () => {
    const { deps } = createEmptyDeps()
    const group = createSampleTabGroup('g1', 'example.com')
    const inMemory = createInMemoryRepositories({ tabGroups: [] })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    let summary: {
      restoredTabGroupCount: number
      restoredUrlRecordCount: number
    } = {
      restoredTabGroupCount: -1,
      restoredUrlRecordCount: -1,
    }
    await act(async () => {
      summary = await result.current.restoreOpenedUrlsSnapshot({
        snapshot: { savedTabs: [group] },
      })
    })
    expect(summary.restoredTabGroupCount).toBe(1)
    expect(summary.restoredUrlRecordCount).toBe(0)
  })

  it('restoreOpenedUrlsSnapshot は parentCategories / urlRecords を含む snapshot をそのまま use-case へ流す', async () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories({ tabGroups: [] })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    let summary = { restoredTabGroupCount: -1, restoredUrlRecordCount: -1 }
    await act(async () => {
      summary = await result.current.restoreOpenedUrlsSnapshot({
        snapshot: {
          parentCategories: [
            {
              domainNames: ['example.com'],
              domains: ['group-1'],
              id: 'cat-1',
              name: 'Docs',
            },
          ],
          savedTabs: [createSampleTabGroup('g1', 'example.com')],
          urlRecords: [
            {
              id: 'url-1',
              savedAt: 1,
              title: 'example',
              url: 'https://example.com',
            },
          ],
        },
      })
    })
    expect(summary.restoredTabGroupCount).toBe(1)
    expect(summary.restoredUrlRecordCount).toBe(1)
  })

  it('restoreOpenedUrlsSnapshot の use-case 失敗時は error をセットし再 throw する', async () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories({ tabGroups: [] })
    const failingParentCategoryRepository: ParentCategoryRepository = {
      // eslint-disable-next-line typescript/require-await
      findAll: async () => [],
      // eslint-disable-next-line typescript/require-await
      findById: async () => null,
      // eslint-disable-next-line typescript/require-await
      removeByIds: async () => undefined,
      // eslint-disable-next-line typescript/require-await
      saveAll: async () => {
        throw new Error('restore-broken')
      },
    }
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      parentCategoryRepository: failingParentCategoryRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      await expect(
        result.current.restoreOpenedUrlsSnapshot({
          snapshot: {
            parentCategories: [
              {
                domainNames: [],
                domains: [],
                id: 'cat-1',
                name: 'Docs',
              },
            ],
          },
        }),
      ).rejects.toThrow(/.*/)
    })
    expect(result.current.viewModel.error).not.toBeNull()
  })

  it('deleteTabGroup の snapshot に parentCategories が含まれるケースを吸収する', async () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories({ tabGroups: [] })
    const baseUseCases = createSavedTabsUseCases({
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    })
    // parentCategories 付きの snapshot を返すモックへ差し替える
    const useCases = {
      ...baseUseCases,
      deleteTabGroup: (() =>
        Promise.resolve({
          removedTabGroupId: 'g1' as never,
          removedUrlRecordIds: [],
          snapshot: {
            customProjects: undefined,
            parentCategories: [
              {
                domainNames: ['example.com'],
                domains: [],
                id: 'cat-1' as never,
                name: 'Docs' as never,
              },
            ],
            savedTabs: [createSampleTabGroup('g1', 'example.com')],
            urlRecords: [],
          },
        }) as never) as never,
    }
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({
      deps: overrideDeps,
      useCases,
    })
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      const dto = await result.current.deleteTabGroup({ tabGroupId: 'g1' })
      expect(dto.removedTabGroupId).toBe('g1')
    })
  })

  it('deleteTabGroup の use-case 失敗時は error をセットし再 throw する', async () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories({ tabGroups: [] })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      await expect(
        result.current.deleteTabGroup({ tabGroupId: 'not-found' }),
      ).rejects.toThrow(/.*/)
    })
    expect(result.current.viewModel.error).not.toBeNull()
  })

  it('syncCategoryAssignments の use-case 失敗時は error をセットし再 throw する', async () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories({ tabGroups: [] })
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    // parentCategoryRepository は空配列を返すので、存在しない parentCategoryId
    // を指定すると SavedTabsDomainError が投げられる
    await act(async () => {
      await expect(
        result.current.syncCategoryAssignments({
          command: {
            domain: 'example.com',
            parentCategoryId: 'missing-cat',
          },
        }),
      ).rejects.toThrow(/.*/)
    })
    expect(result.current.viewModel.error).not.toBeNull()
  })

  it('removeUnreferencedUrlRecords の use-case 失敗時は error をセットし再 throw する', async () => {
    const failingUrlRecordRepository: UrlRecordRepository = {
      // eslint-disable-next-line typescript/require-await
      findAll: async () => {
        throw new Error('storage broken')
      },
      // eslint-disable-next-line typescript/require-await
      findById: async () => null,
      // eslint-disable-next-line typescript/require-await
      removeByIds: async () => undefined,
      // eslint-disable-next-line typescript/require-await
      saveAll: async () => undefined,
    }
    const { deps } = createEmptyDeps()
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      urlRecordRepository: failingUrlRecordRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      await expect(
        result.current.removeUnreferencedUrlRecords(),
      ).rejects.toThrow(/.*/)
    })
    expect(result.current.viewModel.error).not.toBeNull()
  })

  it('openSavedUrl の use-case 成功時に snapshot に parentCategories / urlRecords が含まれていれば controller に保持する', async () => {
    const urlRecord = createUrlRecord({
      id: 'url-g1',
      savedAt: 1,
      title: 'example article',
      url: 'https://example.com/article',
    })
    const { deps } = createEmptyDeps([urlRecord])
    const inMemory = createInMemoryRepositories({
      tabGroups: [createSampleTabGroup('g1', 'example.com')],
    })
    const baseUseCases = createSavedTabsUseCases({
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    })
    // parentCategories 付き snapshot を返すモックへ差し替える
    const useCases = {
      ...baseUseCases,
      openSavedUrl: (() =>
        Promise.resolve({
          openedUrl: 'https://example.com/article',
          removedUrlRecord: null,
          removedUrlRecordId: null,
          snapshot: {
            customProjects: undefined,
            parentCategories: [
              {
                domainNames: ['example.com'],
                domains: [],
                id: 'cat-1' as never,
                name: 'Docs' as never,
              },
            ],
            savedTabs: undefined,
            urlRecords: [
              {
                id: 'url-g1' as never,
                savedAt: 1 as never,
                title: 'example article',
                url: 'https://example.com/article' as never,
              },
            ],
          },
        }) as never) as never,
    }
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({
      deps: overrideDeps,
      useCases,
    })
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      const dto = await result.current.openSavedUrl({
        origin: 'click',
        settings: {
          removeTabAfterExternalDrop: false,
          removeTabAfterOpen: false,
        },
        urlRecordId: 'url-g1',
      })
      expect(dto.openedUrl).toBe('https://example.com/article')
    })
  })

  it('deleteTabGroup の snapshot に urlRecords が含まれるケースを吸収する', async () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories({ tabGroups: [] })
    const baseUseCases = createSavedTabsUseCases({
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    })
    const useCases = {
      ...baseUseCases,
      deleteTabGroup: (() =>
        Promise.resolve({
          removedTabGroupId: 'g1' as never,
          removedUrlRecordIds: ['url-1' as never],
          snapshot: {
            customProjects: undefined,
            parentCategories: undefined,
            savedTabs: [createSampleTabGroup('g1', 'example.com')],
            urlRecords: [
              {
                id: 'url-1' as never,
                savedAt: 1 as never,
                title: 'example',
                url: 'https://example.com' as never,
              },
            ],
          },
        }) as never) as never,
    }
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    }
    const { result } = renderController({
      deps: overrideDeps,
      useCases,
    })
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      const dto = await result.current.deleteTabGroup({ tabGroupId: 'g1' })
      expect(dto.removedUrlRecordIds).toHaveLength(1)
    })
  })

  it('refresh の repository 取得失敗時は error をセットする', async () => {
    const failingTabGroupRepository: TabGroupRepository = {
      // eslint-disable-next-line typescript/require-await
      findAll: async () => {
        throw new Error('storage broken')
      },
      // eslint-disable-next-line typescript/require-await
      findById: async () => null,
      // eslint-disable-next-line typescript/require-await
      removeByIds: async () => undefined,
      // eslint-disable-next-line typescript/require-await
      saveAll: async () => undefined,
    }
    const { deps } = createEmptyDeps()
    const overrideDeps: SavedTabsUseCasesDeps = {
      ...deps,
      tabGroupRepository: failingTabGroupRepository,
    }
    const { result } = renderController({ deps: overrideDeps })
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.viewModel.error).not.toBeNull()
    expect(result.current.viewModel.loading).toBe(false)
  })

  it('removeUnreferencedUrlRecords は use-case の removedCount を返す', async () => {
    const { deps } = createEmptyDeps()
    const { result } = renderController({ deps })
    await act(async () => {
      await result.current.refresh()
    })
    let removed = 0
    await act(async () => {
      removed = (await result.current.removeUnreferencedUrlRecords())
        .removedCount
    })
    expect(removed).toBe(0)
  })

  it('syncCategoryAssignments の戻り値を view-model へ集計する', async () => {
    const { deps } = createEmptyDeps()
    const { result } = renderController({ deps })
    await act(async () => {
      await result.current.refresh()
    })
    let summary: {
      assignedTabGroupCount: number
      updatedCategoryCount: number
      unassignedTabGroupCount: number
    } = {
      assignedTabGroupCount: -1,
      unassignedTabGroupCount: -1,
      updatedCategoryCount: -1,
    }
    await act(async () => {
      summary = await result.current.syncCategoryAssignments({})
    })
    expect(summary.assignedTabGroupCount).toBe(0)
    expect(summary.unassignedTabGroupCount).toBe(0)
    expect(summary.updatedCategoryCount).toBe(0)
  })

  it('createSavedTabsUseCases が use-case を組み立てる', () => {
    const { deps } = createEmptyDeps()
    const inMemory = createInMemoryRepositories()
    const useCases = createSavedTabsUseCases({
      ...deps,
      customProjectRepository: inMemory.customProjectRepository,
      tabGroupRepository: inMemory.tabGroupRepository,
    })
    expect(useCases.openSavedUrl).toBeTypeOf('function')
    expect(useCases.deleteTabGroup).toBeTypeOf('function')
    expect(useCases.restoreOpenedUrlsSnapshot).toBeTypeOf('function')
    expect(useCases.syncCategoryAssignments).toBeTypeOf('function')
    expect(useCases.removeUnreferencedUrlRecords).toBeTypeOf('function')
  })
})
