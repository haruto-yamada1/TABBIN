import { describe, expect, it } from 'vitest'

import {
  createSavedTabsParentCategoryDto as createParentCategory,
  createSavedTabsTabGroupDto as createTabGroup,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures'

import { toCustomProjectViewModel } from './CustomProjectViewModel'
import {
  createDomainModeViewModel,
  toParentCategoryViewModel,
} from './DomainModeViewModel'
import { toTabGroupViewModel } from './TabGroupViewModel'

describe('DomainModeViewModel', () => {
  describe('toParentCategoryViewModel', () => {
    it('ParentCategory を view-model へ変換する', () => {
      const category = createParentCategory({
        domainNames: ['example.com', 'docs.example'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
      const vm = toParentCategoryViewModel(category)
      expect(vm).toStrictEqual({
        domainNames: ['example.com', 'docs.example'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
    })
  })

  describe('createDomainModeViewModel', () => {
    it('tabGroups の displayUrlCount を合算し、searchQuery と categories を保持する', () => {
      const groups = [
        createTabGroup({
          domain: 'example.com',
          id: 'g1',
          urlIds: ['u1', 'u2', 'u3'],
        }),
        createTabGroup({
          domain: 'news.example',
          id: 'g2',
          urlIds: [],
        }),
      ]
      const categories = [
        createParentCategory({
          domainNames: ['example.com'],
          domains: ['g1'],
          id: 'cat-1',
          name: 'Docs',
        }),
      ]
      const customProjects = [
        toCustomProjectViewModel({
          categories: ['news'],
          createdAt: 1,
          id: 'p1',
          name: 'Reading',
          updatedAt: 1,
          urlIds: ['u9', 'u10'],
        }),
      ]
      const vm = createDomainModeViewModel({
        categories,
        customProjects,
        error: null,
        loading: false,
        searchQuery: 'example',
        tabGroups: groups,
      })
      expect(vm.displayCount).toBe(3)
      expect(vm.hasContent).toBe(true)
      expect(vm.loading).toBe(false)
      expect(vm.error).toBeNull()
      expect(vm.searchQuery).toBe('example')
      expect(vm.categories).toHaveLength(1)
      expect(vm.categories[0]?.id).toBe('cat-1')
      expect(vm.tabGroups).toHaveLength(2)
      expect(vm.customProjects).toHaveLength(1)
    })

    it('tabGroups / customProjects / categories が空なら hasContent=false', () => {
      const vm = createDomainModeViewModel({
        categories: [],
        customProjects: [],
        error: null,
        loading: true,
        searchQuery: '',
        tabGroups: [],
      })
      expect(vm.hasContent).toBe(false)
      expect(vm.displayCount).toBe(0)
      expect(vm.loading).toBe(true)
      expect(vm.categories).toStrictEqual([])
      expect(vm.tabGroups).toStrictEqual([])
    })

    it('error が non-null なら error フィールドに反映する', () => {
      const vm = createDomainModeViewModel({
        categories: [],
        customProjects: [],
        error: 'something went wrong',
        loading: false,
        searchQuery: '',
        tabGroups: [],
      })
      expect(vm.error).toBe('something went wrong')
    })

    it('tabGroup view-model の urlIds を独立コピーとして保持する', () => {
      const groups = [
        createTabGroup({
          domain: 'example.com',
          id: 'g1',
          urlIds: ['u1', 'u2'],
        }),
      ]
      const vm = createDomainModeViewModel({
        categories: [],
        customProjects: [],
        error: null,
        loading: false,
        searchQuery: '',
        tabGroups: groups,
      })
      const vmGroup = vm.tabGroups[0]
      if (!vmGroup) {
        throw new Error('tabGroup view-model is missing')
      }
      expect(
        toTabGroupViewModel(groups[0] ?? { domain: '', id: '' }),
      ).toBeDefined()
      expect(vmGroup.urlIds).toStrictEqual(['u1', 'u2'])
    })
  })
})
