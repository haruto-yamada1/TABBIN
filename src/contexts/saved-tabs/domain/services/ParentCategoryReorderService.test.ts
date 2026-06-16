import { describe, expect, it } from 'vitest'

import { buildReorderedCategoryOrder } from './ParentCategoryReorderService'

describe('ParentCategoryReorderService.buildReorderedCategoryOrder', () => {
  it('確定済み順序 (isCategoryReorderMode=false) で active を over の位置へ移動する', () => {
    const result = buildReorderedCategoryOrder({
      activeId: 'cat-b',
      categoryOrder: ['cat-a', 'cat-b', 'cat-c'],
      isCategoryReorderMode: false,
      overId: 'cat-c',
      tempCategoryOrder: [],
    })
    expect(result).toStrictEqual(['cat-a', 'cat-c', 'cat-b'])
  })

  it('並び替えモード (isCategoryReorderMode=true) では tempCategoryOrder を編集対象にする', () => {
    const result = buildReorderedCategoryOrder({
      activeId: 'cat-a',
      categoryOrder: ['cat-a', 'cat-b', 'cat-c'],
      isCategoryReorderMode: true,
      overId: 'cat-c',
      tempCategoryOrder: ['cat-c', 'cat-b', 'cat-a'],
    })
    expect(result).toStrictEqual(['cat-a', 'cat-c', 'cat-b'])
  })

  it('activeId と overId が同一なら順序を保った配列をコピーして返す', () => {
    const result = buildReorderedCategoryOrder({
      activeId: 'cat-a',
      categoryOrder: ['cat-a', 'cat-b', 'cat-c'],
      isCategoryReorderMode: false,
      overId: 'cat-a',
      tempCategoryOrder: [],
    })
    expect(result).toStrictEqual(['cat-a', 'cat-b', 'cat-c'])
  })

  it('activeId が現在の順序に存在しない場合は null を返す', () => {
    const result = buildReorderedCategoryOrder({
      activeId: 'unknown',
      categoryOrder: ['cat-a', 'cat-b'],
      isCategoryReorderMode: false,
      overId: 'cat-b',
      tempCategoryOrder: [],
    })
    expect(result).toBeNull()
  })

  it('overId が現在の順序に存在しない場合は null を返す', () => {
    const result = buildReorderedCategoryOrder({
      activeId: 'cat-a',
      categoryOrder: ['cat-a', 'cat-b'],
      isCategoryReorderMode: false,
      overId: 'unknown',
      tempCategoryOrder: [],
    })
    expect(result).toBeNull()
  })

  it('戻り値配列は元の配列とは別インスタンス（破壊的変更なし）', () => {
    const categoryOrder = ['cat-a', 'cat-b', 'cat-c']
    const result = buildReorderedCategoryOrder({
      activeId: 'cat-a',
      categoryOrder,
      isCategoryReorderMode: false,
      overId: 'cat-c',
      tempCategoryOrder: [],
    })
    expect(result).not.toBe(categoryOrder)
    expect(categoryOrder).toStrictEqual(['cat-a', 'cat-b', 'cat-c'])
  })
})
