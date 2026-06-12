import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'

import {
  createSavedAnalyticsView,
  deleteSavedAnalyticsView,
  loadSavedAnalyticsViews,
  saveSavedAnalyticsViews,
} from './analytics'

const storageMocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {}

  return {
    getChromeStorageLocal: vi.fn(() => ({
      // eslint-disable-next-line typescript/require-await
      get: vi.fn(async (keys: string | string[]) => {
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, state[key]]))
        }

        return {
          [keys]: state[keys],
        }
      }),
      // eslint-disable-next-line typescript/require-await
      set: vi.fn(async (value: Record<string, unknown>) => {
        Object.assign(state, value)
      }),
    })),
    reset: () => {
      for (const key of Object.keys(state)) {
        // eslint-disable-next-line typescript/no-dynamic-delete
        delete state[key]
      }
    },
    state,
    warnMissingChromeStorage: vi.fn(),
  }
})

vi.mock('@/lib/browser/chrome-storage', () => ({
  getChromeStorageLocal: storageMocks.getChromeStorageLocal,
  warnMissingChromeStorage: storageMocks.warnMissingChromeStorage,
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
        query: baseQuery,
        updatedAt: 2,
      },
    ]

    await expect(loadSavedAnalyticsViews()).resolves.toStrictEqual(
      storageMocks.state.savedAnalyticsViews,
    )
  })

  it('保存済み分析ビューが配列でなければ空配列を返す', async () => {
    storageMocks.state.savedAnalyticsViews = {
      id: 'not-an-array',
    }

    await expect(loadSavedAnalyticsViews()).resolves.toStrictEqual([])
  })

  it('Chrome storage がない場合は読み込みと保存を警告だけで終える', async () => {
    storageMocks.getChromeStorageLocal.mockReturnValueOnce(null as never)
    await expect(loadSavedAnalyticsViews()).resolves.toStrictEqual([])

    storageMocks.getChromeStorageLocal.mockReturnValueOnce(null as never)
    await expect(saveSavedAnalyticsViews([])).resolves.toBeUndefined()

    expect(storageMocks.warnMissingChromeStorage).toHaveBeenCalledWith(
      '分析ビューの読み込み',
    )
    expect(storageMocks.warnMissingChromeStorage).toHaveBeenCalledWith(
      '分析ビューの保存',
    )
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

    expect(storageMocks.state.savedAnalyticsViews).toStrictEqual(views)
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
        query: baseQuery,
        updatedAt: 4,
      },
    ])
  })
})
