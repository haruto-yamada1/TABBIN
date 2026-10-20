// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsSortPreferencesPort } from '@/contexts/saved-tabs/application/ports/SavedTabsSortPreferencesPort'

import { useSortOrder } from './useSortOrder'

const { preferencePort } = vi.hoisted(() => ({
  preferencePort: {
    read: vi.fn<SavedTabsSortPreferencesPort['read']>(),
    write: vi.fn<SavedTabsSortPreferencesPort['write']>(),
    subscribe: vi.fn<SavedTabsSortPreferencesPort['subscribe']>(),
  },
}))
vi.mock('../controllers/SavedTabsUseCasesContext', () => ({
  useSavedTabsUseCases: () => ({
    deps: { sortPreferencesPort: preferencePort },
  }),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const getPreferenceListener = () => {
  const call = preferencePort.subscribe.mock.calls.at(-1)
  assert(call)
  return call[2]
}

type Item = {
  domain: string
}

const items: Item[] = [
  { domain: 'zeta.example.com' },
  { domain: 'alpha.example.com' },
  { domain: 'beta.example.com' },
]

describe('useSortOrderフック', () => {
  it('デフォルトでは元の順序を返す', () => {
    const { result } = renderHook(() =>
      useSortOrder(items, (item) => item.domain),
    )

    expect(result.current.sortOrder).toBe('default')
    expect(result.current.sortedItems).toStrictEqual(items)
  })

  it('sortOrder が asc のとき昇順に並べ替える', () => {
    const { result } = renderHook(() =>
      useSortOrder(items, (item) => item.domain),
    )

    act(() => {
      result.current.setSortOrder('asc')
    })

    expect(result.current.sortedItems.map((item) => item.domain)).toStrictEqual(
      ['alpha.example.com', 'beta.example.com', 'zeta.example.com'],
    )
  })

  it('sortOrder が desc のとき降順に並べ替える', () => {
    const { result } = renderHook(() =>
      useSortOrder(items, (item) => item.domain),
    )

    act(() => {
      result.current.setSortOrder('desc')
    })

    expect(result.current.sortedItems.map((item) => item.domain)).toStrictEqual(
      ['zeta.example.com', 'beta.example.com', 'alpha.example.com'],
    )
  })
})

describe('永続化されたスコープ別ソート', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferencePort.read.mockResolvedValue('default')
    preferencePort.write.mockResolvedValue(undefined)
    preferencePort.subscribe.mockReturnValue(() => {})
  })

  it('読み込みでは書かず、変更を保存して再訪で復元する', async () => {
    let saved: Awaited<ReturnType<SavedTabsSortPreferencesPort['read']>> =
      'default'
    preferencePort.read.mockImplementation(async () => saved)
    preferencePort.write.mockImplementation(async (_scope, _id, order) => {
      saved = order
    })
    const mount = () =>
      renderHook(() =>
        useSortOrder(items, (item) => item.domain, {
          scope: 'category',
          id: 'one',
        }),
      )
    const first = mount()
    await waitFor(() =>
      expect(preferencePort.read).toHaveBeenCalledWith('category', 'one'),
    )
    expect(preferencePort.write).not.toHaveBeenCalled()
    await act(async () => first.result.current.setSortOrder('desc'))
    expect(preferencePort.write).toHaveBeenCalledWith('category', 'one', 'desc')
    first.unmount()
    const second = mount()
    await waitFor(() => expect(second.result.current.sortOrder).toBe('desc'))
    expect(
      second.result.current.sortedItems.map((item) => item.domain),
    ).toStrictEqual([
      'zeta.example.com',
      'beta.example.com',
      'alpha.example.com',
    ])
    expect(items[0]?.domain).toBe('zeta.example.com')
  })

  it('別画面の変更・削除を反映し、IDが変わったら別の選択を読む', async () => {
    preferencePort.read.mockImplementation(async (_scope, id) =>
      id === 'one' ? 'asc' : 'default',
    )
    const { result, rerender } = renderHook(
      ({ id }) =>
        useSortOrder(items, (item) => item.domain, { scope: 'category', id }),
      { initialProps: { id: 'one' } },
    )
    await waitFor(() => expect(result.current.sortOrder).toBe('asc'))
    act(() => getPreferenceListener()('desc'))
    expect(result.current.sortOrder).toBe('desc')
    act(() => getPreferenceListener()('default'))
    expect(result.current.sortedItems).toStrictEqual(items)
    rerender({ id: 'two' })
    await waitFor(() =>
      expect(preferencePort.read).toHaveBeenCalledWith('category', 'two'),
    )
    expect(result.current.sortOrder).toBe('default')
  })

  it('遅い初期読み込みで新しい同期結果を上書きしない', async () => {
    let finishRead = (
      _order: Awaited<ReturnType<SavedTabsSortPreferencesPort['read']>>,
    ) => {}
    preferencePort.read.mockImplementation(
      async () =>
        new Promise((resolve) => {
          finishRead = resolve
        }),
    )
    const { result } = renderHook(() =>
      useSortOrder(items, (item) => item.domain, {
        scope: 'category',
        id: 'one',
      }),
    )
    await act(async () => {
      getPreferenceListener()('desc')
      finishRead('asc')
    })
    expect(result.current.sortOrder).toBe('desc')
  })

  it('保存失敗では最後に確認できたソートへ戻し再試行できる', async () => {
    preferencePort.write.mockRejectedValueOnce(new Error('quota'))
    const { result } = renderHook(() =>
      useSortOrder(items, (item) => item.domain, {
        scope: 'category',
        id: 'one',
      }),
    )
    await waitFor(() => expect(preferencePort.read).toHaveBeenCalled())
    await act(async () => result.current.setSortOrder('desc'))
    expect(result.current.sortOrder).toBe('default')
    await act(async () => result.current.setSortOrder('asc'))
    expect(result.current.sortOrder).toBe('asc')
  })
})
