import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import { normalizeAnalyticsQuery } from '@/features/analytics/lib/analytics'

import {
  createSavedAnalyticsView,
  deleteSavedAnalyticsView,
  loadSavedAnalyticsViews,
  saveSavedAnalyticsViews,
} from './analytics'

const storageMocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  const dataPlane = {
    readValues: vi.fn(async () => {
      const value = state.savedAnalyticsViews
      return Array.isArray(value) ? value : []
    }),
    replaceValues: vi.fn(async (values: readonly unknown[]) => {
      state.savedAnalyticsViews = [...values]
    }),
  }

  return {
    dataPlane,
    getAnalyticsViewsDataPlane: vi.fn<() => typeof dataPlane>(() => dataPlane),
    reset: () => {
      for (const key of Object.keys(state)) {
        delete state[key]
      }
    },
    state,
  }
})

vi.mock('@/app/composition/analyticsViewsDataPlane', () => ({
  getAnalyticsViewsDataPlane: storageMocks.getAnalyticsViewsDataPlane,
}))

const baseQuery: AnalyticsQuery = {
  chartType: 'bar',
  compareBy: 'none',
  filters: {
    excludedDomains: [],
    excludedParentCategories: [],
    excludedProjectCategories: [],
    excludedProjects: [],
    excludedSubCategories: [],
    includedDomains: [],
    includedParentCategories: [],
    includedProjectCategories: [],
    includedProjects: [],
    includedSubCategories: [],
  },
  groupBy: 'domain',
  limit: 8,
  mode: 'both',
  normalize: false,
  sort: 'value-desc',
  stacked: false,
  timeBucket: 'day',
  timeRange: '30d',
}

describe('analytics storage', () => {
  beforeEach(() => {
    storageMocks.reset()
    vi.clearAllMocks()
  })

  it('保存済み分析ビュー一覧を読み込む', async () => {
    storageMocks.state.savedAnalyticsViews = [
      {
        createdAt: 1,
        id: 'view-1',
        name: 'Top Domains',
        query: normalizeAnalyticsQuery(baseQuery),
        updatedAt: 2,
      },
    ]

    await expect(loadSavedAnalyticsViews()).resolves.toEqual([
      expect.objectContaining({
        createdAt: 1,
        id: 'view-1',
        name: 'Top Domains',
        query: expect.objectContaining({
          metric: 'first-saved',
          schemaVersion: 2,
        }),
        updatedAt: 2,
      }),
    ])
  })

  it('旧modeとcollection groupをv2 membership queryへ移行する', async () => {
    storageMocks.state.savedAnalyticsViews = [
      {
        createdAt: 1,
        id: 'view-legacy-project',
        name: 'Legacy Project',
        query: { ...baseQuery, groupBy: 'project', mode: 'custom' },
        updatedAt: 2,
      },
    ]

    await expect(loadSavedAnalyticsViews()).resolves.toEqual([
      expect.objectContaining({
        query: expect.objectContaining({
          collectionType: 'custom',
          metric: 'membership-added',
          schemaVersion: 2,
        }),
      }),
    ])
  })

  it('不正なqueryをshallow castせず破棄する', async () => {
    storageMocks.state.savedAnalyticsViews = [
      {
        createdAt: 1,
        id: 'view-invalid',
        name: 'Invalid',
        query: { ...baseQuery, groupBy: 'unknown' },
        updatedAt: 2,
      },
    ]

    await expect(loadSavedAnalyticsViews()).resolves.toStrictEqual([])
  })

  it('custom date rangeを保持し未知のschema versionを破棄する', async () => {
    storageMocks.state.savedAnalyticsViews = [
      {
        createdAt: 1,
        id: 'view-custom-range',
        name: 'Custom Range',
        query: {
          ...baseQuery,
          customDateRange: { from: '2026-01-01', to: '2026-01-31' },
          schemaVersion: 2,
          timeRange: 'custom',
        },
        updatedAt: 2,
      },
      {
        createdAt: 3,
        id: 'view-future-schema',
        name: 'Future Schema',
        query: { ...baseQuery, schemaVersion: 3 },
        updatedAt: 4,
      },
    ]

    await expect(loadSavedAnalyticsViews()).resolves.toEqual([
      expect.objectContaining({
        id: 'view-custom-range',
        query: expect.objectContaining({
          customDateRange: { from: '2026-01-01', to: '2026-01-31' },
          schemaVersion: 2,
          timeRange: 'custom',
        }),
      }),
    ])
  })

  it('保存済み分析ビューが配列でなければ空配列を返す', async () => {
    storageMocks.state.savedAnalyticsViews = {
      id: 'not-an-array',
    }

    await expect(loadSavedAnalyticsViews()).resolves.toStrictEqual([])
  })

  it('IndexedDB failureを空のビューや保存成功へ置き換えず呼び出し元へ返す', async () => {
    const failure = new Error('database unavailable')
    storageMocks.dataPlane.readValues.mockRejectedValueOnce(failure)
    await expect(loadSavedAnalyticsViews()).rejects.toBe(failure)

    storageMocks.dataPlane.replaceValues.mockRejectedValueOnce(failure)
    await expect(saveSavedAnalyticsViews([])).rejects.toBe(failure)
  })

  it('分析ビュー一覧を保存する', async () => {
    const views = [
      {
        createdAt: 1,
        id: 'view-1',
        name: 'Top Domains',
        query: baseQuery,
        updatedAt: 2,
      },
    ]

    await saveSavedAnalyticsViews(views)

    expect(storageMocks.state.savedAnalyticsViews).toStrictEqual([
      {
        ...views[0],
        query: normalizeAnalyticsQuery(baseQuery),
      },
    ])
  })

  it('新しい分析ビューを作成する', async () => {
    // eslint-disable-next-line typescript/await-thenable
    const view = await createSavedAnalyticsView({
      name: 'Custom View',
      now: 100,
      query: baseQuery,
    })

    expect(view).toMatchObject({
      createdAt: 100,
      name: 'Custom View',
      query: baseQuery,
      updatedAt: 100,
    })
    expect(view.id).toContain('analytics-view-')
  })

  it('指定した分析ビューを削除する', async () => {
    storageMocks.state.savedAnalyticsViews = [
      {
        createdAt: 1,
        id: 'view-1',
        name: 'Top Domains',
        query: baseQuery,
        updatedAt: 2,
      },
      {
        createdAt: 3,
        id: 'view-2',
        name: 'Mode Comparison',
        query: baseQuery,
        updatedAt: 4,
      },
    ]

    await deleteSavedAnalyticsView('view-1')

    expect(storageMocks.state.savedAnalyticsViews).toStrictEqual([
      {
        createdAt: 3,
        id: 'view-2',
        name: 'Mode Comparison',
        query: normalizeAnalyticsQuery(baseQuery),
        updatedAt: 4,
      },
    ])
  })
})
