import { describe, expect, it, vi } from 'vitest'

import type { CustomProject } from '@/types/storage'

import { moveCustomProjectUrlAndSyncState } from './custom-project-move'

describe('moveCustomProjectUrlAndSyncState', () => {
  it('移動成功後に最新プロジェクト一覧を再取得して state を同期する', async () => {
    const moveUrlBetweenCustomProjects = vi.fn().mockResolvedValue(undefined)
    const updatedProjects: CustomProject[] = [
      {
        id: 'project-a',
        name: 'Project A',
        urlIds: [],
        categories: [],
        createdAt: 1,
        updatedAt: 10,
      },
      {
        id: 'project-b',
        name: 'Project B',
        urlIds: ['url-1'],
        categories: [],
        createdAt: 2,
        updatedAt: 10,
      },
    ]
    const getCustomProjects = vi.fn().mockResolvedValue(updatedProjects)
    const setCustomProjects = vi.fn()

    await moveCustomProjectUrlAndSyncState({
      sourceProjectId: 'project-a',
      targetProjectId: 'project-b',
      url: 'https://example.com',
      moveUrlBetweenCustomProjects,
      getCustomProjects,
      setCustomProjects,
    })

    expect(moveUrlBetweenCustomProjects).toHaveBeenCalledWith(
      'project-a',
      'project-b',
      'https://example.com',
    )
    expect(getCustomProjects).toHaveBeenCalledTimes(1)
    expect(setCustomProjects).toHaveBeenCalledWith(updatedProjects)
  })

  it('同一プロジェクトへのドロップでは何もしない', async () => {
    const moveUrlBetweenCustomProjects = vi.fn()
    const getCustomProjects = vi.fn()
    const setCustomProjects = vi.fn()

    await moveCustomProjectUrlAndSyncState({
      sourceProjectId: 'project-a',
      targetProjectId: 'project-a',
      url: 'https://example.com',
      moveUrlBetweenCustomProjects,
      getCustomProjects,
      setCustomProjects,
    })

    expect(moveUrlBetweenCustomProjects).not.toHaveBeenCalled()
    expect(getCustomProjects).not.toHaveBeenCalled()
    expect(setCustomProjects).not.toHaveBeenCalled()
  })
})
