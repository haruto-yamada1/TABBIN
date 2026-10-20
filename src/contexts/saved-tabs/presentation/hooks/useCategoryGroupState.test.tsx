// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, expect, it, vi } from 'vitest'

import type { RenameParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/RenameParentCategoryUseCase'
import type { ReorderDomainsInCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderDomainsInCategoryUseCase'

import { useCategoryGroupState } from './useCategoryGroupState'
import { useCategoryManagement } from './useCategoryManagement'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

beforeEach(() => vi.clearAllMocks())

it('awaits persistence, keeps the preview on failure, and permits retry', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  let rejectSave: (reason: Error) => void = () => undefined
  const save = vi
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockImplementationOnce(
      async () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    .mockResolvedValue(undefined)
  const { result } = renderHook(() =>
    useCategoryGroupState({
      category: { id: 'parent', name: 'Work', collections: [] },
      domains: [
        { id: 'one', domain: 'one.test', urls: [] },
        { id: 'two', domain: 'two.test', urls: [] },
      ],
      handleUpdateDomainsOrder: save,
      handleDeleteGroup: vi.fn(),
      isCategoryReorderMode: false,
      renameParentCategoryUseCase: vi.fn<RenameParentCategoryUseCase>(),
    }),
  )
  act(() =>
    result.current.reorder.handleDragEnd({
      active: { id: 'one' },
      over: { id: 'two' },
    } as Parameters<typeof result.current.reorder.handleDragEnd>[0]),
  )
  let pending: Promise<void> | undefined
  act(() => {
    pending = result.current.reorder.handleConfirmReorder()
  })
  expect(toast.success).not.toHaveBeenCalled()
  expect(result.current.reorder.isReorderMode).toBe(true)
  await act(async () => {
    rejectSave(new Error('storage failed'))
    await pending
  })
  expect(toast.error).toHaveBeenCalledOnce()
  expect(result.current.reorder.isReorderMode).toBe(true)
  await act(async () => {
    await result.current.reorder.handleConfirmReorder()
  })
  expect(toast.success).toHaveBeenCalledOnce()
  expect(result.current.reorder.isReorderMode).toBe(false)
})

const parentCategory = {
  id: 'parent',
  name: 'Work',
  collections: [
    { id: 'one', domain: 'one.test' },
    { id: 'two', domain: 'two.test' },
  ],
}
const domainGroups = [
  { id: 'one', domain: 'one.test', urls: [] },
  { id: 'two', domain: 'two.test', urls: [] },
]
const managementParams = (
  reorderDomainsInCategoryUseCase: ReorderDomainsInCategoryUseCase,
) => ({
  reorderParentCategoriesUseCase: vi.fn(),
  removeSubCategoryFromTabGroupsUseCase: vi.fn(),
  moveDomainBetweenCategoriesUseCase: vi.fn(),
  reorderDomainsInCategoryUseCase,
})

it('retains the domain preview when the real management handler cannot persist, then permits retry', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const reorderedCategory = {
    ...parentCategory,
    collections: parentCategory.collections.toReversed(),
  }
  const save = vi
    .fn<ReorderDomainsInCategoryUseCase>()
    .mockRejectedValueOnce(new Error('storage failed'))
    .mockResolvedValue([reorderedCategory])
  const params = managementParams(save)
  const { result } = renderHook(() => {
    const management = useCategoryManagement(params)
    const group = useCategoryGroupState({
      category: parentCategory,
      domains: domainGroups,
      handleUpdateDomainsOrder: management.handleUpdateDomainsOrder,
      handleDeleteGroup: vi.fn(),
      isCategoryReorderMode: false,
      renameParentCategoryUseCase: vi.fn<RenameParentCategoryUseCase>(),
    })
    return { management, group }
  })
  act(() => result.current.management.setCategories([parentCategory]))
  act(() =>
    result.current.group.reorder.handleDragEnd({
      active: { id: 'one' },
      over: { id: 'two' },
    } as Parameters<typeof result.current.group.reorder.handleDragEnd>[0]),
  )
  await act(async () => {
    await result.current.group.reorder.handleConfirmReorder()
  })
  expect(result.current.group.reorder.isReorderMode).toBe(true)
  expect(result.current.management.categories).toEqual([parentCategory])
  expect(toast.success).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledWith('savedTabs.domainOrder.updateError')
  await act(async () => {
    await result.current.group.reorder.handleConfirmReorder()
  })
  expect(result.current.management.categories).toEqual([reorderedCategory])
  expect(result.current.group.reorder.isReorderMode).toBe(false)
  expect(toast.success).toHaveBeenCalledOnce()
})

it.each([false, true])(
  'rejects a missing target category (present in initial view: %s)',
  async (inView) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const save = vi.fn<ReorderDomainsInCategoryUseCase>().mockResolvedValue([])
    const params = managementParams(save)
    const { result } = renderHook(() => useCategoryManagement(params))
    if (inView) {
      act(() => result.current.setCategories([parentCategory]))
    }
    await expect(
      result.current.handleUpdateDomainsOrder('parent', domainGroups),
    ).rejects.toThrow('更新対象のカテゴリが見つかりません')
    expect(result.current.categories).toEqual(inView ? [parentCategory] : [])
    expect(save).toHaveBeenCalledTimes(inView ? 1 : 0)
  },
)

it('keeps the saved parent category order after a failed confirmation and cancellation', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const params = managementParams(vi.fn<ReorderDomainsInCategoryUseCase>())
  params.reorderParentCategoriesUseCase.mockRejectedValue(
    new Error('storage failed'),
  )
  const { result } = renderHook(() => useCategoryManagement(params))
  const initialCategories = [
    parentCategory,
    { id: 'other', name: 'Other', collections: [] },
  ]
  act(() => result.current.setCategories(initialCategories))
  act(() =>
    result.current.handleCategoryDragEnd({
      active: { id: 'parent' },
      over: { id: 'other' },
    } as Parameters<typeof result.current.handleCategoryDragEnd>[0]),
  )
  await act(async () => {
    await result.current.handleConfirmCategoryReorder()
  })
  expect(result.current.isCategoryReorderMode).toBe(true)
  expect(result.current.categoryOrder).toEqual(['parent', 'other'])
  act(() => result.current.handleCancelCategoryReorder())
  expect(result.current.isCategoryReorderMode).toBe(false)
  expect(result.current.categoryOrder).toEqual(['parent', 'other'])
  expect(result.current.categories).toEqual(initialCategories)
  expect(toast.success).not.toHaveBeenCalled()
})
