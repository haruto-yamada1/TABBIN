import { describe, expect, it } from 'vitest'

import { createCustomProject } from '../../domain/entities/CustomProject'
import { createCustomModeViewModel } from './CustomModeViewModel'

describe('CustomModeViewModel', () => {
  describe('createCustomModeViewModel', () => {
    it('projects の displayUrlCount を合算し、searchQuery を保持する', () => {
      const projects = [
        createCustomProject({
          categories: ['news'],
          createdAt: 1,
          id: 'p1',
          name: 'Reading',
          updatedAt: 1,
          urlIds: ['u1', 'u2', 'u3'],
        }),
        createCustomProject({
          categories: [],
          createdAt: 1,
          id: 'p2',
          name: 'Work',
          updatedAt: 1,
          urlIds: ['u4'],
        }),
      ]
      const vm = createCustomModeViewModel({
        error: null,
        loading: false,
        projects,
        searchQuery: 'reading',
      })
      expect(vm.displayCount).toBe(4)
      expect(vm.hasContent).toBe(true)
      expect(vm.loading).toBe(false)
      expect(vm.error).toBeNull()
      expect(vm.searchQuery).toBe('reading')
      expect(vm.projects).toHaveLength(2)
    })

    it('projects が空なら hasContent=false', () => {
      const vm = createCustomModeViewModel({
        error: null,
        loading: true,
        projects: [],
        searchQuery: '',
      })
      expect(vm.hasContent).toBe(false)
      expect(vm.displayCount).toBe(0)
      expect(vm.loading).toBe(true)
    })

    it('error が non-null なら error フィールドに反映する', () => {
      const vm = createCustomModeViewModel({
        error: 'load failed',
        loading: false,
        projects: [],
        searchQuery: '',
      })
      expect(vm.error).toBe('load failed')
    })

    it('project view-model の urlIds を独立コピーとして保持する', () => {
      const projects = [
        createCustomProject({
          categories: [],
          createdAt: 1,
          id: 'p1',
          name: 'Reading',
          updatedAt: 1,
          urlIds: ['u1', 'u2'],
        }),
      ]
      const vm = createCustomModeViewModel({
        error: null,
        loading: false,
        projects,
        searchQuery: '',
      })
      const vmProject = vm.projects[0]
      if (!vmProject) {
        throw new Error('project view-model is missing')
      }
      expect(vmProject.urlIds).toStrictEqual(['u1', 'u2'])
    })
  })
})
