// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CustomProject, UserSettings } from '@/types/storage'

import { useProjectManagement } from './useProjectManagement'

const projectManagementMocks = vi.hoisted(() => ({
  addCategoryToProject: vi.fn(),
  addUrlToCustomProject: vi.fn(),
  createCustomProject: vi.fn(),
  deleteCustomProject: vi.fn(),
  getCustomProjects: vi.fn(),
  removeCategoryFromProject: vi.fn(),
  removeUrlFromCustomProject: vi.fn(),
  removeUrlsFromCustomProject: vi.fn(),
  renameCategoryInProject: vi.fn(),
  reorderProjectUrls: vi.fn(),
  setUrlCategory: vi.fn(),
  updateCategoryOrder: vi.fn(),
  updateCustomProjectName: vi.fn(),
  updateProjectKeywords: vi.fn(),
  updateProjectOrder: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: 'ja',
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages('ja')
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '',
        )
      },
    }),
  }
})

vi.mock('@/lib/storage/projects', () => projectManagementMocks)

const defaultSettings: UserSettings = {
  removeTabAfterOpen: true,
  removeTabAfterExternalDrop: true,
  excludePatterns: [],
  enableCategories: true,
  autoDeletePeriod: 'never',
  showSavedTime: false,
  clickBehavior: 'saveSameDomainTabs',
  excludePinnedTabs: false,
  openUrlInBackground: true,
  openAllInNewWindow: false,
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  colors: {},
}

const projectSnapshot: CustomProject[] = [
  {
    id: 'project-1',
    name: 'Project A',
    urlIds: ['url-a', 'url-b'],
    categories: [],
    createdAt: 1,
    updatedAt: 2,
  },
]

const updatedProjects: CustomProject[] = [
  {
    ...projectSnapshot[0],
    urlIds: ['url-b'],
    updatedAt: 3,
  },
]

const projectWithCategories: CustomProject = {
  id: 'project-2',
  name: 'Project B',
  categories: ['Inbox', 'Done'],
  categoryOrder: ['Done', 'Inbox'],
  urls: [
    {
      url: 'https://example.com/a',
      title: 'Example A',
      category: 'Inbox',
    },
    {
      url: 'https://example.com/b',
      title: 'Example B',
      category: 'Done',
    },
  ],
  createdAt: 10,
  updatedAt: 20,
}

const waitForLoadedProjects = async (
  result: ReturnType<
    typeof renderHook<ReturnType<typeof useProjectManagement>, []>
  >['result'],
  expectedProjects: CustomProject[] = projectSnapshot,
) => {
  await waitFor(() => {
    expect(result.current.customProjects).toEqual(expectedProjects)
  })
}

describe('useProjectManagement', () => {
  beforeEach(() => {
    for (const mock of Object.values(projectManagementMocks)) {
      mock.mockReset()
    }
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'))
    projectManagementMocks.getCustomProjects.mockResolvedValue(projectSnapshot)

    const chromeSetMock = vi.fn()
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({
            customProjectOrder: ['project-1'],
            customProjects: projectSnapshot,
          })),
          set: chromeSetMock,
        },
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('初期ロードと同期の失敗時に再取得したプロジェクトを返す', async () => {
    const latestProjects = [projectWithCategories]
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(latestProjects)

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'domain'),
    )

    await waitForLoadedProjects(result)

    await expect(
      act(async () => result.current.syncDomainDataToCustomProjects()),
    ).resolves.toEqual(latestProjects)

    expect(result.current.customProjects).toEqual(latestProjects)
    expect(console.error).toHaveBeenCalledWith(
      'データ同期エラー:',
      expect.any(Error),
    )
  })

  it('初期ロード失敗はログだけで保持し、unmount 後の完了は state 反映しない', async () => {
    projectManagementMocks.getCustomProjects.mockRejectedValueOnce(
      new Error('initial load failed'),
    )

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        'ビューモードの読み込みエラー:',
        expect.any(Error),
      )
    })
    expect(result.current.customProjects).toEqual([])

    let resolveProjects: (projects: CustomProject[]) => void = () => undefined
    projectManagementMocks.getCustomProjects.mockImplementationOnce(
      () =>
        new Promise<CustomProject[]>((resolve) => {
          resolveProjects = resolve
        }),
    )

    const { result: pendingResult, unmount } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )
    unmount()

    await act(async () => {
      resolveProjects(projectSnapshot)
    })

    expect(pendingResult.current.customProjects).toEqual([])
  })

  it('同期の再取得も失敗した場合は空配列を返す', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'domain'),
    )

    await waitForLoadedProjects(result)

    await expect(
      act(async () => result.current.syncDomainDataToCustomProjects()),
    ).resolves.toEqual([])

    expect(console.error).toHaveBeenCalledWith(
      'プロジェクト再取得エラー:',
      expect.any(Error),
    )
  })

  it('ビューモードを切り替え、カスタムモードではプロジェクトを同期する', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce([projectWithCategories])

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'domain'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleViewModeChange('domain')
    })

    expect(result.current.viewMode).toBe('domain')
    expect(projectManagementMocks.getCustomProjects).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.handleViewModeChange('custom')
    })

    expect(result.current.viewMode).toBe('custom')
    expect(result.current.customProjects).toEqual([projectWithCategories])
  })

  it('プロジェクトを作成し、空名と重複実行は無視する', async () => {
    const createdProject: CustomProject = {
      id: 'project-new',
      name: 'New Project',
      categories: [],
      createdAt: 30,
      updatedAt: 30,
    }
    let resolveCreate: (value: CustomProject) => void = () => undefined
    projectManagementMocks.createCustomProject.mockImplementation(
      () =>
        new Promise<CustomProject>((resolve) => {
          resolveCreate = resolve
        }),
    )

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleCreateProject('   ')
    })

    expect(projectManagementMocks.createCustomProject).not.toHaveBeenCalled()

    await act(async () => {
      const firstCreate = result.current.handleCreateProject(' New Project ')
      const duplicateCreate = result.current.handleCreateProject('new project')
      resolveCreate(createdProject)
      await Promise.all([firstCreate, duplicateCreate])
    })

    expect(projectManagementMocks.createCustomProject).toHaveBeenCalledOnce()
    expect(projectManagementMocks.createCustomProject).toHaveBeenCalledWith(
      'New Project',
    )
    expect(result.current.customProjects[0]).toEqual(createdProject)
    expect(toast.success).toHaveBeenCalledWith(
      'プロジェクト「New Project」を追加しました',
    )
  })

  it('作成時と名前変更時の重複名エラーを通知する', async () => {
    projectManagementMocks.createCustomProject.mockRejectedValue(
      new Error('DUPLICATE_PROJECT_NAME:Project A'),
    )
    projectManagementMocks.updateCustomProjectName.mockRejectedValue(
      new Error('DUPLICATE_PROJECT_NAME:Project A'),
    )

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleCreateProject('Project A')
      await result.current.handleRenameProject('project-1', 'Project A')
    })

    expect(toast.error).toHaveBeenCalledWith(
      'プロジェクト名「Project A」は既に使用されています',
    )
  })

  it('プロジェクトの削除、名称変更、キーワード更新を state に反映する', async () => {
    const projectKeywords = {
      titleKeywords: ['docs'],
      urlKeywords: ['example'],
      domainKeywords: ['example.com'],
    }

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleRenameProject('project-1', 'Renamed')
    })

    await waitFor(() => {
      expect(result.current.customProjects[0]?.name).toBe('Renamed')
    })

    await act(async () => {
      await result.current.handleUpdateProjectKeywords(
        'project-1',
        projectKeywords,
      )
    })

    expect(projectManagementMocks.updateCustomProjectName).toHaveBeenCalledWith(
      'project-1',
      'Renamed',
    )
    expect(result.current.customProjects[0]).toMatchObject({
      id: 'project-1',
      name: 'Renamed',
      projectKeywords,
    })

    await act(async () => {
      await result.current.handleDeleteProject('missing-project')
    })

    expect(projectManagementMocks.deleteCustomProject).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handleDeleteProject('project-1')
    })

    expect(projectManagementMocks.deleteCustomProject).toHaveBeenCalledWith(
      'project-1',
    )
    expect(result.current.customProjects).toEqual([])
  })

  it('URL追加、カテゴリ削除、URL分類は最新プロジェクトを再取得する', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce([projectWithCategories])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(updatedProjects)

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleAddUrlToProject(
        'project-1',
        'https://example.com/c',
        'Example C',
      )
    })

    expect(projectManagementMocks.addUrlToCustomProject).toHaveBeenCalledWith(
      'project-1',
      'https://example.com/c',
      'Example C',
    )
    expect(result.current.customProjects).toEqual([projectWithCategories])

    await act(async () => {
      await result.current.handleDeleteProjectCategory('project-1', 'Inbox')
    })

    expect(
      projectManagementMocks.removeCategoryFromProject,
    ).toHaveBeenCalledWith('project-1', 'Inbox')
    expect(result.current.customProjects).toEqual([])

    await act(async () => {
      await result.current.handleSetUrlCategory(
        'project-1',
        'https://example.com/a',
        'Done',
      )
    })

    expect(projectManagementMocks.setUrlCategory).toHaveBeenCalledWith(
      'project-1',
      'https://example.com/a',
      'Done',
    )
    expect(result.current.customProjects).toEqual(updatedProjects)
  })

  it('カテゴリ追加、カテゴリ順序、URL順序、プロジェクト順序、カテゴリ名変更を state に反映する', async () => {
    projectManagementMocks.getCustomProjects.mockResolvedValue([
      projectWithCategories,
      projectSnapshot[0],
    ])
    const reorderedUrls = [
      {
        url: 'https://example.com/b',
        title: 'Example B',
        category: 'Done',
      },
    ]

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result, [
      projectWithCategories,
      projectSnapshot[0],
    ])

    await act(async () => {
      await result.current.handleAddCategory('project-2', 'Review')
      await result.current.handleAddCategory('project-2', 'Inbox')
      await result.current.handleUpdateCategoryOrder('project-2', [
        'Review',
        'Inbox',
      ])
      await result.current.handleReorderUrls('project-2', reorderedUrls)
      await result.current.handleReorderProjects(['project-1', 'project-2'])
      await result.current.handleRenameCategory('project-2', 'Inbox', 'Later')
    })

    expect(projectManagementMocks.addCategoryToProject).toHaveBeenCalledWith(
      'project-2',
      'Review',
    )
    expect(projectManagementMocks.updateCategoryOrder).toHaveBeenCalledWith(
      'project-2',
      ['Review', 'Inbox'],
    )
    expect(projectManagementMocks.reorderProjectUrls).toHaveBeenCalledWith(
      'project-2',
      reorderedUrls,
    )
    expect(projectManagementMocks.updateProjectOrder).toHaveBeenCalledWith([
      'project-1',
      'project-2',
    ])
    expect(projectManagementMocks.renameCategoryInProject).toHaveBeenCalledWith(
      'project-2',
      'Inbox',
      'Later',
    )
    expect(result.current.customProjects.map((project) => project.id)).toEqual([
      'project-1',
      'project-2',
    ])
    expect(result.current.customProjects[1]).toMatchObject({
      categories: ['Later', 'Done', 'Review'],
      categoryOrder: ['Review', 'Later'],
      urls: reorderedUrls,
    })
  })

  it('プロジェクト順序更新は順序指定のないプロジェクトを末尾に送る', async () => {
    const thirdProject: CustomProject = {
      id: 'project-3',
      name: 'Project C',
      categories: [],
      createdAt: 30,
      updatedAt: 40,
    }
    projectManagementMocks.getCustomProjects.mockResolvedValue([
      projectSnapshot[0],
      projectWithCategories,
      thirdProject,
    ])

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result, [
      projectSnapshot[0],
      projectWithCategories,
      thirdProject,
    ])

    await act(async () => {
      await result.current.handleReorderProjects(['project-2'])
    })

    expect(result.current.customProjects.map((project) => project.id)).toEqual([
      'project-2',
      'project-1',
      'project-3',
    ])
  })

  it('各操作の失敗をエラートーストで通知する', async () => {
    projectManagementMocks.createCustomProject.mockRejectedValueOnce(
      new Error('create failed'),
    )
    projectManagementMocks.deleteCustomProject.mockRejectedValueOnce(
      new Error('delete failed'),
    )
    projectManagementMocks.updateCustomProjectName.mockRejectedValueOnce(
      new Error('rename failed'),
    )
    projectManagementMocks.updateProjectKeywords.mockRejectedValueOnce(
      new Error('keyword failed'),
    )
    projectManagementMocks.addUrlToCustomProject.mockRejectedValueOnce(
      new Error('add url failed'),
    )
    projectManagementMocks.removeUrlFromCustomProject.mockRejectedValueOnce(
      new Error('delete url failed'),
    )
    projectManagementMocks.removeUrlsFromCustomProject.mockRejectedValueOnce(
      new Error('delete urls failed'),
    )
    projectManagementMocks.addCategoryToProject.mockRejectedValueOnce(
      new Error('add category failed'),
    )
    projectManagementMocks.removeCategoryFromProject.mockRejectedValueOnce(
      new Error('delete category failed'),
    )
    projectManagementMocks.setUrlCategory.mockRejectedValueOnce(
      new Error('set category failed'),
    )
    projectManagementMocks.updateCategoryOrder.mockRejectedValueOnce(
      new Error('category order failed'),
    )
    projectManagementMocks.reorderProjectUrls.mockRejectedValueOnce(
      new Error('url order failed'),
    )
    projectManagementMocks.updateProjectOrder.mockRejectedValueOnce(
      new Error('project order failed'),
    )
    projectManagementMocks.renameCategoryInProject.mockRejectedValueOnce(
      new Error('category rename failed'),
    )

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleCreateProject('Broken')
      await result.current.handleDeleteProject('project-1')
      await result.current.handleRenameProject('project-1', 'Broken')
      await result.current.handleUpdateProjectKeywords('project-1', {
        titleKeywords: [],
        urlKeywords: [],
        domainKeywords: [],
      })
      await result.current.handleAddUrlToProject(
        'project-1',
        'https://example.com/broken',
        'Broken',
      )
      await result.current.handleDeleteUrlFromProject(
        'project-1',
        'https://example.com/a',
      )
      await result.current.handleDeleteUrlsFromProject('project-1', [
        'https://example.com/a',
      ])
      await result.current.handleAddCategory('project-1', 'Broken')
      await result.current.handleDeleteProjectCategory('project-1', 'Broken')
      await result.current.handleSetUrlCategory(
        'project-1',
        'https://example.com/a',
        'Broken',
      )
      await result.current.handleUpdateCategoryOrder('project-1', ['Broken'])
      await result.current.handleReorderUrls('project-1', [])
      await result.current.handleReorderProjects(['project-1'])
      await result.current.handleRenameCategory('project-1', 'Old', 'Broken')
    })

    expect(toast.error).toHaveBeenCalledWith('プロジェクトの作成に失敗しました')
    expect(toast.error).toHaveBeenCalledWith('プロジェクトの削除に失敗しました')
    expect(toast.error).toHaveBeenCalledWith(
      'プロジェクト名の変更に失敗しました',
    )
    expect(toast.error).toHaveBeenCalledWith(
      'キーワード設定の更新に失敗しました',
    )
    expect(toast.error).toHaveBeenCalledWith('タブの追加に失敗しました')
    expect(toast.error).toHaveBeenCalledWith('タブの削除に失敗しました')
    expect(toast.error).toHaveBeenCalledWith('カテゴリの追加に失敗しました')
    expect(toast.error).toHaveBeenCalledWith('カテゴリの削除に失敗しました')
    expect(toast.error).toHaveBeenCalledWith('タブの分類更新に失敗しました')
    expect(toast.error).toHaveBeenCalledWith('カテゴリの順序更新に失敗しました')
    expect(toast.error).toHaveBeenCalledWith('タブの順序更新に失敗しました')
    expect(toast.error).toHaveBeenCalledWith(
      'プロジェクト順序の更新に失敗しました',
    )
    expect(toast.error).toHaveBeenCalledWith('カテゴリ名の変更に失敗しました')
  })

  it('カスタムモードの単体タブ削除を Undo で復元できる', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce(updatedProjects)

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleDeleteUrlFromProject(
        'project-1',
        'https://example.com/a',
      )
    })

    expect(
      projectManagementMocks.removeUrlFromCustomProject,
    ).toHaveBeenCalledWith('project-1', 'https://example.com/a')
    expect(toast.info).toHaveBeenCalledWith(
      '削除した1件のタブを保存データに戻せます',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )

    const undoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined

    await act(async () => {
      await undoOptions?.action?.onClick?.()
    })

    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      customProjectOrder: ['project-1'],
      customProjects: projectSnapshot,
    })
    expect(result.current.customProjects).toEqual(projectSnapshot)
  })

  it('カスタムモードの一括タブ削除を Undo で復元できる', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce([])

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleDeleteUrlsFromProject('project-1', [
        'https://example.com/a',
        'https://example.com/b',
      ])
    })

    expect(
      projectManagementMocks.removeUrlsFromCustomProject,
    ).toHaveBeenCalledWith('project-1', [
      'https://example.com/a',
      'https://example.com/b',
    ])
    expect(toast.info).toHaveBeenCalledWith(
      '削除した2件のタブを保存データに戻せます',
      expect.objectContaining({
        action: expect.objectContaining({
          label: '元に戻す',
        }),
      }),
    )
  })

  it('Undo の保存データがない場合は復元処理を行わず、復元失敗は通知する', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce(updatedProjects)
      .mockResolvedValueOnce(updatedProjects)

    const storageGet = vi.mocked(chrome.storage.local.get) as unknown as {
      mockResolvedValueOnce: (value: unknown) => void
    }
    storageGet.mockResolvedValueOnce({})
    storageGet.mockResolvedValueOnce({
      customProjects: projectSnapshot,
    })
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(
      new Error('restore failed'),
    )

    const { result } = renderHook(() =>
      useProjectManagement([], defaultSettings, 'custom'),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleDeleteUrlFromProject(
        'project-1',
        'https://example.com/a',
      )
    })

    const missingUndoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined

    await act(async () => {
      await missingUndoOptions?.action?.onClick?.()
    })

    expect(chrome.storage.local.set).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handleDeleteUrlFromProject(
        'project-1',
        'https://example.com/b',
      )
    })

    const failingUndoOptions = vi.mocked(toast.info).mock.calls.at(-1)?.[1] as
      | {
          action?: {
            onClick?: () => Promise<void>
          }
        }
      | undefined

    await act(async () => {
      await failingUndoOptions?.action?.onClick?.()
    })

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      customProjects: projectSnapshot,
    })
    expect(toast.error).toHaveBeenCalledWith('保存データを復元できませんでした')
  })
})
