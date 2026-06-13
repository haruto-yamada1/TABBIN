import { describe, expect, it } from 'vitest'

import { toCustomProjectViewModel } from './CustomProjectViewModel'
import {
  createEmptySavedTabsViewModel,
  createSavedTabsViewModel,
} from './SavedTabsViewModel'
import { toTabGroupViewModel } from './TabGroupViewModel'

describe('SavedTabsViewModel', () => {
  describe('createEmptySavedTabsViewModel', () => {
    it('loading=true / 空配列 / error=null を返す', () => {
      const vm = createEmptySavedTabsViewModel()
      expect(vm.loading).toBe(true)
      expect(vm.tabGroups).toStrictEqual([])
      expect(vm.customProjects).toStrictEqual([])
      expect(vm.error).toBeNull()
      expect(vm.displayCount).toBe(0)
      expect(vm.hasContent).toBe(false)
    })
  })

  describe('createSavedTabsViewModel', () => {
    it('tabGroups / customProjects の displayUrlCount を合算する', () => {
      const tabGroups = [
        toTabGroupViewModel({
          domain: 'example.com',
          id: 'g1',
          urlIds: ['u1', 'u2', 'u3'],
        }),
        toTabGroupViewModel({
          domain: 'news.example',
          id: 'g2',
          urlIds: [],
          urls: [
            { id: 'u4', title: 'a', url: 'https://news.example/a' },
            { id: 'u5', title: 'b', url: 'https://news.example/b' },
          ],
        }),
      ]
      const customProjects = [
        toCustomProjectViewModel({
          categories: [],
          createdAt: 1,
          id: 'p1',
          name: 'Reading',
          updatedAt: 1,
          urlIds: ['u9', 'u10'],
        }),
      ]
      const vm = createSavedTabsViewModel({
        customProjects,
        error: null,
        loading: false,
        tabGroups,
      })
      expect(vm.displayCount).toBe(7)
      expect(vm.hasContent).toBe(true)
      expect(vm.loading).toBe(false)
      expect(vm.error).toBeNull()
    })

    it('error が non-null なら hasContent は true になり得る', () => {
      const vm = createSavedTabsViewModel({
        customProjects: [],
        error: 'something went wrong',
        loading: false,
        tabGroups: [],
      })
      expect(vm.error).toBe('something went wrong')
      expect(vm.hasContent).toBe(false)
      expect(vm.displayCount).toBe(0)
    })
  })
})

describe('TabGroupViewModel.toTabGroupViewModel', () => {
  it('urlIds / urls / subCategories から displayUrlCount と subCategoryCount を導出する', () => {
    const vm = toTabGroupViewModel({
      domain: 'example.com',
      id: 'g1',
      subCategories: ['a', 'b', 'c'],
      urlIds: ['u1', 'u2'],
      urls: [
        {
          id: 'u1',
          subCategory: 'a',
          title: 'x',
          url: 'https://example.com/x',
        },
        {
          id: 'u2',
          subCategory: 'b',
          title: 'y',
          url: 'https://example.com/y',
        },
      ],
    })
    expect(vm.displayUrlCount).toBe(2)
    expect(vm.subCategoryCount).toBe(3)
    expect(vm.hasUrls).toBe(true)
  })

  it('urls が無く urlIds のみでも displayUrlCount を返す', () => {
    const vm = toTabGroupViewModel({
      domain: 'example.com',
      id: 'g1',
      urlIds: ['u1', 'u2', 'u3'],
    })
    expect(vm.displayUrlCount).toBe(3)
    expect(vm.hasUrls).toBe(true)
  })

  it('urls / urlIds が空なら hasUrls=false', () => {
    const vm = toTabGroupViewModel({
      domain: 'example.com',
      id: 'g1',
    })
    expect(vm.displayUrlCount).toBe(0)
    expect(vm.hasUrls).toBe(false)
  })
})

describe('CustomProjectViewModel.toCustomProjectViewModel', () => {
  it('urls / urlIds から displayUrlCount を導出する', () => {
    const vm = toCustomProjectViewModel({
      categories: ['news', 'work'],
      categoryOrder: ['work', 'news'],
      createdAt: 1,
      id: 'p1',
      name: 'Reading',
      updatedAt: 2,
      urlIds: ['u1', 'u2'],
    })
    expect(vm.displayUrlCount).toBe(2)
    expect(vm.hasUrls).toBe(true)
    expect(vm.categories).toStrictEqual(['news', 'work'])
    expect(vm.categoryOrder).toStrictEqual(['work', 'news'])
  })

  it('urls の長さを優先して displayUrlCount を返す', () => {
    const vm = toCustomProjectViewModel({
      categories: [],
      createdAt: 1,
      id: 'p1',
      name: 'Reading',
      updatedAt: 1,
      urlIds: ['u1', 'u2', 'u3'],
      urls: [
        { id: 'u1', title: 'a', url: 'https://example.com/a' },
        { id: 'u2', title: 'b', url: 'https://example.com/b' },
      ],
    })
    expect(vm.displayUrlCount).toBe(2)
  })

  it('categoryOrder 未指定なら categories をそのまま使う', () => {
    const vm = toCustomProjectViewModel({
      categories: ['news'],
      createdAt: 1,
      id: 'p1',
      name: 'Reading',
      updatedAt: 2,
    })
    expect(vm.categoryOrder).toStrictEqual(['news'])
  })
})
