import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { savedTabsDefaultUserSettings } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDefaultsDto'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'

import { useCategoryModal } from './useCategoryModal'

vi.mock('@/features/i18n/context/I18nProvider', () => {
  const t = (key: string) => key
  return { useI18n: () => ({ t }) }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

type PageData = Awaited<ReturnType<GetSavedTabsPageDataQuery>>

describe('useCategoryModal', () => {
  it('古いカテゴリ読み込みが後から完了しても現在の選択を上書きしない', async () => {
    const older = Promise.withResolvers<PageData>()
    const newer = Promise.withResolvers<PageData>()
    const getSavedTabsPageDataQuery = vi
      .fn<GetSavedTabsPageDataQuery>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const { result, rerender } = renderHook(
      ({ tabGroups }) =>
        useCategoryModal({
          tabGroups,
          getSavedTabsPageDataQuery,
          createParentCategoryUseCase: vi.fn(),
          deleteParentCategoryUseCase: vi.fn(),
          assignDomainToCategoryUseCase: vi.fn(),
        }),
      { initialProps: { tabGroups: [] } },
    )
    rerender({ tabGroups: [] })
    const pageData = (id: string): PageData => ({
      parentCategories: [{ id, name: id, collections: [] }],
      tabGroups: [],
      userSettings: savedTabsDefaultUserSettings,
    })
    await act(async () => {
      newer.resolve(pageData('newer'))
      await newer.promise
    })
    expect(result.current.selection.selectedCategoryId).toBe('newer')
    await act(async () => {
      older.resolve(pageData('older'))
      await older.promise
    })
    expect(result.current.selection.selectedCategoryId).toBe('newer')
    expect(result.current.selection.categories.map(({ id }) => id)).toEqual([
      'newer',
    ])
  })

  it('keeps the selected parent when a domain update refreshes the modal', async () => {
    const pageData: PageData = {
      parentCategories: ['first', 'practice'].map((id) => ({
        id,
        name: id,
        collections: [],
      })),
      tabGroups: [],
      userSettings: savedTabsDefaultUserSettings,
    }
    const getSavedTabsPageDataQuery = vi
      .fn<GetSavedTabsPageDataQuery>()
      .mockResolvedValue(pageData)
    const { result, rerender } = renderHook(
      ({ tabGroups }) =>
        useCategoryModal({
          tabGroups,
          getSavedTabsPageDataQuery,
          createParentCategoryUseCase: vi.fn(),
          deleteParentCategoryUseCase: vi.fn(),
          assignDomainToCategoryUseCase: vi.fn(),
        }),
      { initialProps: { tabGroups: [] } },
    )
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      result.current.selection.handleCategoryChange('practice')
    })
    expect(result.current.selection.selectedCategoryId).toBe('practice')
    rerender({ tabGroups: [] })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.selection.selectedCategoryId).toBe('practice')
  })
})
