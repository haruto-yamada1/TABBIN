import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'

import { createSavedTabsCustomProjectDto as createCurrentCustomProject } from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures'
import { createSavedTabsCustomProjectDto as createCustomProjectViewModel } from '@/contexts/saved-tabs/presentation/testing/SavedTabsCompatibilityFixtures'

import * as defaults from './projectManagementDefaults'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

const clickToastAction = async (): Promise<void> => {
  const action = vi.mocked(toast.info).mock.calls.at(-1)?.[1]?.action
  if (
    typeof action !== 'object' ||
    action === null ||
    !('onClick' in action) ||
    typeof action.onClick !== 'function'
  ) {
    throw new Error('toast action is not available')
  }
  await Reflect.apply(action.onClick, undefined, [undefined])
}

describe('projectManagementDefaults', () => {
  it('未注入use-case/queryはfail-fastする', () => {
    const noops = Object.entries(defaults).filter(
      ([name, value]) =>
        name.startsWith('asyncNoop') && typeof value === 'function',
    )

    expect(noops).toHaveLength(19)
    for (const [, noop] of noops) {
      expect(() => Reflect.apply(noop, undefined, [])).toThrow(
        /is not provided/,
      )
    }
  })

  it('undo対象entityが無ければ復元しない', async () => {
    const restore = vi.fn()
    const setCustomProjects = vi.fn()
    defaults.showCustomProjectDeleteUndoToast({
      count: 1,
      restoreCustomProjectsSnapshotUseCase: restore,
      setCustomProjects,
      snapshot: {},
      t: (key) => key,
    })
    await clickToastAction()

    expect(restore).not.toHaveBeenCalled()
    expect(setCustomProjects).not.toHaveBeenCalled()
  })

  it('entity snapshotからproject stateを復元する', async () => {
    const restore = vi.fn(async () => {})
    const setCustomProjects = vi.fn()
    defaults.showCustomProjectDeleteUndoToast({
      count: 2,
      restoreCustomProjectsSnapshotUseCase: restore,
      setCustomProjects,
      snapshot: {
        customProjectOrder: ['project-1'],
        customProjects: [
          createCurrentCustomProject({
            categories: ['Docs'],
            createdAt: 1,
            id: 'project-1',
            memberships: [{ urlId: 'url-1' }],
            name: 'With URLs',
            updatedAt: 2,
          }),
          createCurrentCustomProject({
            categories: [],
            createdAt: 3,
            id: 'project-2',
            name: 'Without URLs',
            updatedAt: 4,
          }),
        ],
      },
      t: (key) => key,
    })
    await clickToastAction()

    expect(restore).toHaveBeenCalledWith({
      payload: {
        customProjectOrder: ['project-1'],
        customProjects: expect.any(Array),
      },
    })
    expect(setCustomProjects).toHaveBeenCalledWith([
      createCustomProjectViewModel({
        categories: ['Docs'],
        createdAt: 1,
        id: 'project-1',
        memberships: [{ urlId: 'url-1' }],
        name: 'With URLs',
        updatedAt: 2,
      }),
      createCustomProjectViewModel({
        categories: [],
        createdAt: 3,
        id: 'project-2',
        name: 'Without URLs',
        updatedAt: 4,
      }),
    ])
    expect(toast.success).toHaveBeenCalledWith('savedTabs.undo.restored')
  })

  it('raw snapshotをpresentation projectへ変換する', () => {
    expect(
      defaults.toRawStorageCustomProject(
        createCurrentCustomProject({
          categories: ['Docs'],
          createdAt: 1,
          id: 'project-1',
          name: 'Project',
          updatedAt: 2,
        }),
      ),
    ).toMatchObject({
      id: 'project-1',
      categories: ['Docs'],
    })
  })
})
