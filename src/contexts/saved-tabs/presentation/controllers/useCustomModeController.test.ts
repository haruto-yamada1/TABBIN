// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsCustomProjectDto,
  createSavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'

import { useCustomModeController } from './useCustomModeController'
import { useSavedTabsController } from './useSavedTabsController'

afterEach(() => vi.restoreAllMocks())

const project = createSavedTabsCustomProjectDto({
  id: 'project-1',
  name: 'Reading',
  urlIds: ['url-1'],
})
const record = createSavedTabsUrlRecordDto({
  id: 'url-1',
  url: 'https://example.com/article',
})

const setup = (hasRecord = true) => {
  const open = vi.fn(async ({ url }: { url: string }) => ({ url }))
  const deps = createSavedTabsPresentationPortsStub({
    browserTabPort: { open },
  })
  const useCases = createSavedTabsUseCasesStub({
    findUrlRecordByUrl: vi.fn(async () => ({
      record: hasRecord
        ? { id: record.id, title: record.title, url: record.url }
        : null,
    })),
    getCustomProjects: vi.fn(async () => [project]),
    getSavedTabs: vi.fn(async () => []),
    openSavedUrl: vi.fn(async ({ urlRecordId }) => {
      const target = urlRecordId === record.id ? record : null
      if (!target) {
        throw new Error('URL not found')
      }
      const opened = await open({ url: target.url })
      return {
        openedUrl: opened.url,
        removedUrlRecord: null,
        removedUrlRecordId: null,
        snapshot: null,
      }
    }),
  })
  const hook = renderHook(() => {
    const controller = useSavedTabsController({
      deps,
      initialCustomProjects: [project],
      initialTabGroups: [],
      useCases,
    })
    return useCustomModeController({
      controller,
      initialCustomProjects: [project],
    })
  })
  return { ...hook, open }
}

describe('useCustomModeController', () => {
  it('application DTO を custom mode view-model に反映する', () => {
    const { result } = setup()
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.viewModel.projects[0]?.name).toBe('Reading')
  })

  it('検索クエリを view-model と同期する', () => {
    const { result } = setup()
    act(() => result.current.setSearchQuery('reading'))
    expect(result.current.viewModel.searchQuery).toBe('reading')
  })

  it('保存済み URL は application use-case 経由で開く', async () => {
    const { result, open } = setup()
    await act(async () => {
      await result.current.openUrl(record.url)
    })
    expect(open).toHaveBeenCalledWith({ url: record.url })
  })

  it('未保存 URL は BrowserTabPort 経由で開く', async () => {
    const { result, open } = setup(false)
    await act(async () => {
      await result.current.openUrl('https://unknown.example')
    })
    expect(open).toHaveBeenCalledWith({ url: 'https://unknown.example' })
  })
})
