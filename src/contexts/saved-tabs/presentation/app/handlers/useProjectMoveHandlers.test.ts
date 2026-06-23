import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const moveState = vi.hoisted(() => ({
  moveCustomProjectUrlAndSyncState: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: moveState.toastError,
    success: moveState.toastSuccess,
  },
}))

vi.mock('@/contexts/saved-tabs/presentation/lib/custom-project-move', () => ({
  moveCustomProjectUrlAndSyncState: moveState.moveCustomProjectUrlAndSyncState,
}))

import { useProjectMoveHandlers } from './useProjectMoveHandlers'

describe('useProjectMoveHandlers', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const errorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    logSpy.mockClear()
    errorSpy.mockClear()
  })

  it('application DTO を storage 形へ projection して project 間移動に渡す', async () => {
    const setCustomProjects = vi.fn()
    const moveUrlBetweenCustomProjects = vi.fn()
    const savedTabsUseCases = {
      getCustomProjects: vi.fn(async () => [
        {
          categories: ['Docs'],
          createdAt: 1,
          id: 'project-1',
          name: 'Project One',
          updatedAt: 2,
          urlIds: ['url-1'],
        },
        {
          categories: [],
          createdAt: 3,
          id: 'project-2',
          name: 'Project Two',
          updatedAt: 4,
          urlIds: [],
        },
      ]),
      moveUrlBetweenCustomProjects,
    }
    moveState.moveCustomProjectUrlAndSyncState.mockImplementation(
      async (options) => {
        const projects = await options.getCustomProjects()
        expect(projects).toStrictEqual([
          {
            categories: ['Docs'],
            createdAt: 1,
            id: 'project-1',
            name: 'Project One',
            updatedAt: 2,
            urlIds: ['url-1'],
          },
          {
            categories: [],
            createdAt: 3,
            id: 'project-2',
            name: 'Project Two',
            updatedAt: 4,
          },
        ])
        expect(options.moveUrlBetweenCustomProjects).toBe(
          moveUrlBetweenCustomProjects,
        )
        expect(options.setCustomProjects).toBe(setCustomProjects)
      },
    )
    const { result } = renderHook(() =>
      useProjectMoveHandlers({
        savedTabsUseCases: savedTabsUseCases as never,
        setCustomProjects,
        t: (key) => key,
      }),
    )

    await act(async () => {
      await result.current.handleMoveUrlBetweenProjects(
        'project-1',
        'project-2',
        'https://example.com/path?token=secret',
      )
    })

    expect(moveState.moveCustomProjectUrlAndSyncState).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceProjectId: 'project-1',
        targetProjectId: 'project-2',
        url: 'https://example.com/path?token=secret',
      }),
    )
    expect(moveState.toastSuccess).toHaveBeenCalledWith(
      'savedTabs.tab.movedBetweenProjects',
    )
  })

  it('移動に失敗した場合は error toast を表示して null を返す', async () => {
    moveState.moveCustomProjectUrlAndSyncState.mockRejectedValue(
      new Error('move failed'),
    )
    const { result } = renderHook(() =>
      useProjectMoveHandlers({
        savedTabsUseCases: {
          getCustomProjects: vi.fn(),
          moveUrlBetweenCustomProjects: vi.fn(),
        } as never,
        setCustomProjects: vi.fn(),
        t: (key) => key,
      }),
    )

    let value: unknown
    await act(async () => {
      value = await result.current.handleMoveUrlBetweenProjects(
        'project-1',
        'project-2',
        'https://example.com',
      )
    })

    expect(value).toBeNull()
    expect(moveState.toastError).toHaveBeenCalledWith(
      'savedTabs.tab.moveBetweenProjectsError',
    )
  })
})
