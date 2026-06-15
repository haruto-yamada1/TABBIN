/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { CustomProject, UserSettings } from '@/types/storage'

import { useProjectManagement } from './useProjectManagement'

const projectManagementMocks = vi.hoisted(() => ({
  addCategoryToProject: vi.fn(),
  addUrlToCustomProject: vi.fn(),
  createCustomProject: vi.fn().mockResolvedValue({}),
  deleteCustomProject: vi.fn().mockResolvedValue({}),
  // 後方互換: 旧テストが `getCustomProjects` を mock していた名残。
  // 実装は `customProjectRepository.findAll` を使うが、テストでは
  // customProjectRepository の `findAll` 実装を `getCustomProjects` の
  // 戻り値で書き換えるだけで動かせる。
  getCustomProjects: vi.fn(),
  removeCategoryFromProject: vi.fn(),
  removeUrlFromCustomProject: vi.fn(),
  removeUrlsFromCustomProject: vi.fn(),
  renameCategoryInProject: vi.fn(),
  reorderProjectUrls: vi.fn(),
  setUrlCategory: vi.fn(),
  updateCategoryOrder: vi.fn(),
  updateCustomProjectName: vi.fn().mockResolvedValue({}),
  updateProjectKeywords: vi.fn(),
  // 旧テスト互換: 実装は `customProjectRepository.saveOrder` を使う。
  updateProjectOrder: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/lib/storage/projects', () => projectManagementMocks)

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
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
          (_, token) => values?.[token] ?? '', // eslint-disable-line
        )
      },
    }),
  }
})

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
    expect(result.current.customProjects).toStrictEqual(expectedProjects)
  })
}

describe('useProjectManagement', () => {
  let customProjectRepository: CustomProjectRepository
  /**
   * issue #509 で `useProjectManagement` の引数として
   * `customProjectsCommandService` と 3 つの use-case
   * (`createCustomProject` / `deleteCustomProject` /
   * `updateCustomProjectName`) を port として注入する形に
   * なった。これらは `projectManagementMocks` 内の同名 mock 関数
   * をそのまま参照する。
   */
  // `customProjectsCommandService` は `useProjectManagement` の第 5 引数
  // `CustomProjectsCommandService` として渡される。テストでは
  // `projectManagementMocks` の同名関数をそのまま参照する形に統一しつつ、
  // presentation 側で未使用の `removeUrlIdsFromAllCustomProjects` /
  // `removeUrlsFromAllCustomProjects` は no-op vi.fn で補完する。
  // eslint-disable-next-line typescript/no-explicit-any
  let customProjectsCommandService: any

  beforeEach(() => {
    for (const mock of Object.values(projectManagementMocks)) {
      mock.mockReset() // eslint-disable-line
    }
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'))
    // `customProjectRepository.findAll` は `getCustomProjects` の mock
    // 値を通じて後方互換を維持する。テスト本体は
    // `projectManagementMocks.getCustomProjects.mockResolvedValue(...)` で
    // 戻り値を制御できる。
    const findAllMock = vi
      .fn()
      .mockImplementation(() => projectManagementMocks.getCustomProjects())

    customProjectRepository = {
      findAll: findAllMock,
      findAllRaw: vi.fn(),
      findById: vi.fn(),
      removeByIds: vi.fn(),
      restoreAllRaw: vi.fn(),
      saveAll: vi.fn(),
      findOrder: vi.fn(),
      saveOrder: vi.fn(),
    } as unknown as CustomProjectRepository
    ;(
      customProjectRepository.findAllRaw as unknown as {
        mockResolvedValue: (value: unknown) => void
      }
    ).mockResolvedValue([])
    ;(
      customProjectRepository.findOrder as unknown as {
        mockResolvedValue: (value: unknown) => void
      }
    ).mockResolvedValue(['project-1'])
    ;(
      customProjectRepository.saveAll as unknown as {
        mockResolvedValue: (value: unknown) => void
      }
    ).mockResolvedValue(undefined)
    ;(
      customProjectRepository.saveOrder as unknown as {
        mockResolvedValue: (value: unknown) => void
      }
    ).mockResolvedValue(undefined)
    ;(
      customProjectRepository.findById as unknown as {
        mockResolvedValue: (value: unknown) => void
      }
    ).mockResolvedValue(null)
    ;(
      customProjectRepository.removeByIds as unknown as {
        mockResolvedValue: (value: unknown) => void
      }
    ).mockResolvedValue(undefined)
    projectManagementMocks.getCustomProjects.mockResolvedValue(projectSnapshot)

    customProjectsCommandService = {
      addCategoryToProject: projectManagementMocks.addCategoryToProject,
      addUrlToCustomProject: projectManagementMocks.addUrlToCustomProject,
      // 旧 `updateProjectOrder` テスト互換: 実装は
      // `customProjectRepository.saveOrder` を使うため、空の no-op。
      moveUrlBetweenCustomProjects: vi.fn(),
      removeCategoryFromProject:
        projectManagementMocks.removeCategoryFromProject,
      removeUrlFromCustomProject:
        projectManagementMocks.removeUrlFromCustomProject,
      // `removeUrlIdsFromAllCustomProjects` / `removeUrlsFromAllCustomProjects`
      // は presentation 配下では use-case / port 経由の API として参照される
      // ため、後方互換のため no-op vi.fn を用意する。
      removeUrlIdsFromAllCustomProjects: vi.fn(),
      removeUrlsFromAllCustomProjects: vi.fn(),
      removeUrlsFromCustomProject:
        projectManagementMocks.removeUrlsFromCustomProject,
      renameCategoryInProject: projectManagementMocks.renameCategoryInProject,
      reorderProjectUrls: projectManagementMocks.reorderProjectUrls,
      setUrlCategory: projectManagementMocks.setUrlCategory,
      updateCategoryOrder: projectManagementMocks.updateCategoryOrder,
      updateProjectKeywords: projectManagementMocks.updateProjectKeywords,
    } as never
    projectManagementMocks.createCustomProject.mockResolvedValue({
      category: projectSnapshot[0],
      project: projectSnapshot[0],
    })
    projectManagementMocks.deleteCustomProject.mockResolvedValue(undefined)
    projectManagementMocks.updateCustomProjectName.mockResolvedValue({
      all: [projectSnapshot[0]],
      project: projectSnapshot[0],
    })
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
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'domain',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result)

    await expect(
      act(async () => result.current.syncDomainDataToCustomProjects()),
    ).resolves.toStrictEqual(latestProjects)

    expect(result.current.customProjects).toStrictEqual(latestProjects)
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
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        'ビューモードの読み込みエラー:',
        expect.any(Error),
      )
    })
    expect(result.current.customProjects).toStrictEqual([])

    let resolveProjects: (projects: CustomProject[]) => void = () => undefined
    projectManagementMocks.getCustomProjects.mockImplementationOnce(
      () =>
        new Promise<CustomProject[]>((resolve) => {
          resolveProjects = resolve
        }),
    )

    const { result: pendingResult, unmount } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )
    unmount()

    // eslint-disable-next-line typescript/require-await
    await act(async () => {
      resolveProjects(projectSnapshot)
    })

    expect(pendingResult.current.customProjects).toStrictEqual([])
  })

  it('同期の再取得も失敗した場合は空配列を返す', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'domain',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result)

    await expect(
      act(async () => result.current.syncDomainDataToCustomProjects()),
    ).resolves.toStrictEqual([])

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
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'domain',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
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
    expect(result.current.customProjects).toStrictEqual([projectWithCategories])
  })

  it('initialViewMode 未指定なら domain モードで初期化する', async () => {
    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        undefined,
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result)

    expect(result.current.viewMode).toBe('domain')
    expect(result.current.viewModeRef.current).toBe('domain')
  })

  it('プロジェクトを作成し、空名と重複実行は無視する', async () => {
    const createdProject: CustomProject = {
      id: 'project-new',
      name: 'New Project',
      categories: [],
      createdAt: 30,
      updatedAt: 30,
    }
    let resolveCreate: (value: { project: CustomProject }) => void = () =>
      undefined
    projectManagementMocks.createCustomProject.mockImplementation(
      () =>
        new Promise<{ project: CustomProject }>((resolve) => {
          resolveCreate = resolve
        }),
    )

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleCreateProject('   ')
    })

    expect(projectManagementMocks.createCustomProject).not.toHaveBeenCalled()

    await act(async () => {
      const firstCreate = result.current.handleCreateProject(' New Project ')
      const duplicateCreate = result.current.handleCreateProject('new project')
      resolveCreate({ project: createdProject })
      await Promise.all([firstCreate, duplicateCreate])
    })

    expect(projectManagementMocks.createCustomProject).toHaveBeenCalledOnce()
    expect(projectManagementMocks.createCustomProject).toHaveBeenCalledWith({
      name: 'New Project',
    })
    expect(result.current.customProjects[0]).toStrictEqual(createdProject)
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
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
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

    const untouchedProject: CustomProject = {
      id: 'project-untouched',
      name: 'Untouched',
      categories: [],
      createdAt: 4,
      updatedAt: 5,
    }
    projectManagementMocks.getCustomProjects.mockResolvedValue([
      projectSnapshot[0],
      untouchedProject,
    ])

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result, [projectSnapshot[0], untouchedProject])

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
      {
        newName: 'Renamed',
        projectId: 'project-1',
      },
    )
    expect(result.current.customProjects[0]).toMatchObject({
      id: 'project-1',
      name: 'Renamed',
      projectKeywords,
    })
    expect(result.current.customProjects[1]).toStrictEqual(untouchedProject)

    await act(async () => {
      await result.current.handleDeleteProject('missing-project')
    })

    expect(projectManagementMocks.deleteCustomProject).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handleDeleteProject('project-1')
    })

    expect(projectManagementMocks.deleteCustomProject).toHaveBeenCalledWith({
      projectId: 'project-1',
    })
    expect(result.current.customProjects).toStrictEqual([untouchedProject])
  })

  it('URL追加、カテゴリ削除、URL分類は最新プロジェクトを再取得する', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce([projectWithCategories])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(updatedProjects)

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
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
    expect(result.current.customProjects).toStrictEqual([projectWithCategories])

    await act(async () => {
      await result.current.handleDeleteProjectCategory('project-1', 'Inbox')
    })

    expect(
      projectManagementMocks.removeCategoryFromProject,
    ).toHaveBeenCalledWith('project-1', 'Inbox')
    expect(result.current.customProjects).toStrictEqual([])

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
    expect(result.current.customProjects).toStrictEqual(updatedProjects)
  })

  it('カテゴリ追加、カテゴリ順序、URL順序、プロジェクト順序、カテゴリ名変更を state に反映する', async () => {
    const orderedProject: CustomProject = {
      id: 'project-3',
      name: 'Project C',
      categories: [],
      categoryOrder: ['Review'],
      createdAt: 30,
      updatedAt: 40,
    }
    const unorderedProject: CustomProject = {
      id: 'project-4',
      name: 'Project D',
      categories: ['Old'],
      urls: [
        {
          url: 'https://example.com/old',
          title: 'Old',
          category: 'Old',
        },
      ],
      createdAt: 50,
      updatedAt: 60,
    }
    projectManagementMocks.getCustomProjects.mockResolvedValue([
      projectWithCategories,
      projectSnapshot[0],
      orderedProject,
      unorderedProject,
    ])
    const reorderedUrls = [
      {
        url: 'https://example.com/b',
        title: 'Example B',
        category: 'Done',
      },
    ]

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result, [
      projectWithCategories,
      projectSnapshot[0],
      orderedProject,
      unorderedProject,
    ])

    await act(async () => {
      await result.current.handleAddCategory('project-2', 'Review')
      await result.current.handleAddCategory('project-1', 'Review')
      await result.current.handleAddCategory('project-3', 'Review')
      await result.current.handleAddCategory('project-2', 'Inbox')
      await result.current.handleUpdateCategoryOrder('project-2', [
        'Review',
        'Inbox',
      ])
      await result.current.handleReorderUrls('project-2', reorderedUrls)
      await result.current.handleReorderProjects(['project-1', 'project-2'])
      await result.current.handleRenameCategory('project-2', 'Inbox', 'Later')
      await result.current.handleRenameCategory('project-4', 'Old', 'New')
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
    expect(customProjectRepository.saveOrder).toHaveBeenCalledWith([
      'project-1',
      'project-2',
    ])
    expect(projectManagementMocks.renameCategoryInProject).toHaveBeenCalledWith(
      'project-2',
      'Inbox',
      'Later',
    )
    expect(
      result.current.customProjects.map((project) => project.id),
    ).toStrictEqual(['project-1', 'project-2', 'project-3', 'project-4'])
    expect(result.current.customProjects[1]).toMatchObject({
      categories: ['Later', 'Done', 'Review'],
      categoryOrder: ['Review', 'Later'],
      urls: reorderedUrls,
    })
    expect(result.current.customProjects[0]).toMatchObject({
      categories: ['Review'],
      categoryOrder: ['Review'],
    })
    expect(result.current.customProjects[3]).toMatchObject({
      categories: ['New'],
      categoryOrder: undefined,
      urls: [
        {
          url: 'https://example.com/old',
          title: 'Old',
          category: 'New',
        },
      ],
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
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result, [
      projectSnapshot[0],
      projectWithCategories,
      thirdProject,
    ])

    await act(async () => {
      await result.current.handleReorderProjects(['project-2'])
    })

    expect(
      result.current.customProjects.map((project) => project.id),
    ).toStrictEqual(['project-2', 'project-1', 'project-3'])
  })

  it('各操作の失敗をエラートーストで通知する', async () => {
    projectManagementMocks.createCustomProject.mockRejectedValue(
      new Error('create failed'),
    )
    // `handleDeleteProject` 実装は `deleteCustomProjectUseCase` を
    // 2 回 (UNCATEGORIZED_PROJECT_ID 用の noop と実 projectId) 呼ぶ
    // ため、常に reject させる。
    projectManagementMocks.deleteCustomProject.mockRejectedValue(
      new Error('delete failed'),
    )
    projectManagementMocks.updateCustomProjectName.mockRejectedValue(
      new Error('rename failed'),
    )
    projectManagementMocks.updateProjectKeywords.mockRejectedValue(
      new Error('keyword failed'),
    )
    projectManagementMocks.addUrlToCustomProject.mockRejectedValue(
      new Error('add url failed'),
    )
    projectManagementMocks.removeUrlFromCustomProject.mockRejectedValue(
      new Error('delete url failed'),
    )
    projectManagementMocks.removeUrlsFromCustomProject.mockRejectedValue(
      new Error('delete urls failed'),
    )
    projectManagementMocks.addCategoryToProject.mockRejectedValue(
      new Error('add category failed'),
    )
    projectManagementMocks.removeCategoryFromProject.mockRejectedValue(
      new Error('delete category failed'),
    )
    projectManagementMocks.setUrlCategory.mockRejectedValue(
      new Error('set category failed'),
    )
    projectManagementMocks.updateCategoryOrder.mockRejectedValue(
      new Error('category order failed'),
    )
    projectManagementMocks.reorderProjectUrls.mockRejectedValue(
      new Error('url order failed'),
    )
    // 旧 `updateProjectOrder` テスト互換: 実装は
    // `customProjectRepository.saveOrder` を使うため、ここで reject。
    ;(
      customProjectRepository.saveOrder as unknown as {
        mockRejectedValue: (e: unknown) => void
      }
    ).mockRejectedValue(new Error('project order failed'))
    projectManagementMocks.renameCategoryInProject.mockRejectedValue(
      new Error('category rename failed'),
    )

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
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
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce(updatedProjects)

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
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

    expect(customProjectRepository.saveAll).toHaveBeenLastCalledWith(
      projectSnapshot,
    )
    expect(customProjectRepository.saveOrder).toHaveBeenLastCalledWith([
      'project-1',
    ])
    expect(result.current.customProjects).toStrictEqual(projectSnapshot)
  })

  it('Undo は生 snapshot があれば restoreAllRaw 経由で urls / urlMetadata を含めて復元する（PR #506 review P2 対応）', async () => {
    // 生 snapshot にだけ存在する urls / urlMetadata / projectKeywords は
    // entity snapshot には載らないため、saveAll 経由だと merge で脱落する。
    // restoreAllRaw 経由で書けば全フィールドを保存できる。
    const projectSnapshotRaw = [
      {
        categories: ['research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        projectKeywords: {
          domainKeywords: ['example.com'],
          titleKeywords: ['design'],
          urlKeywords: ['plan'],
        },
        updatedAt: 2,
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': { category: 'research', notes: 'memo' },
        },
        urls: [{ title: 'A', url: 'https://example.com/a' }],
      },
    ]
    ;(
      customProjectRepository.findAllRaw as unknown as {
        mockResolvedValueOnce: (value: unknown) => void
      }
    ).mockResolvedValueOnce(projectSnapshotRaw)
    // 1 回目: 初回 load, 2 回目: undo snapshot (projectSnapshot), 3 回目: 削除後
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce([])

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleDeleteUrlFromProject(
        'project-1',
        'https://example.com/a',
      )
    })

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

    expect(customProjectRepository.restoreAllRaw).toHaveBeenCalledWith(
      projectSnapshotRaw,
    )
    expect(customProjectRepository.saveAll).not.toHaveBeenCalled()
  })

  it('restoreAllRaw が未実装の repository では saveAll にフォールバックする', async () => {
    // テストモック等で restoreAllRaw / findAllRaw が省略されているケースを
    // 想定し、entity 経由の saveAll へ安全側に倒れることを確認する。
    const repoWithoutRaw = {
      findAll: customProjectRepository.findAll,
      findById: customProjectRepository.findById,
      removeByIds: customProjectRepository.removeByIds,
      saveAll: customProjectRepository.saveAll,
      findOrder: customProjectRepository.findOrder,
      saveOrder: customProjectRepository.saveOrder,
    } as unknown as CustomProjectRepository
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce([])

    const { result } = renderHook(() =>
      useProjectManagement(
        repoWithoutRaw,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
    )

    await waitForLoadedProjects(result)

    await act(async () => {
      await result.current.handleDeleteUrlFromProject(
        'project-1',
        'https://example.com/a',
      )
    })

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

    expect(customProjectRepository.saveAll).toHaveBeenLastCalledWith(
      projectSnapshot,
    )
  })

  it('カスタムモードの一括タブ削除を Undo で復元できる', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce([])

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
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
    // 1st delete: snapshot = []  → 復元スキップ
    // 2nd delete: snapshot = projectSnapshot → 復元は saveAll (reject) → 失敗通知
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot) // useEffect mount
      .mockResolvedValueOnce([]) // 1st delete: snapshot
      .mockResolvedValueOnce([]) // 1st delete: get updated (削除後)
      .mockResolvedValueOnce(projectSnapshot) // 2nd delete: snapshot
      .mockResolvedValueOnce(projectSnapshot) // 2nd delete: get updated

    ;(
      customProjectRepository.saveAll as unknown as {
        mockRejectedValueOnce: (value: unknown) => void
      }
    ).mockRejectedValueOnce(new Error('restore failed'))

    const { result } = renderHook(() =>
      useProjectManagement(
        customProjectRepository,
        [],
        defaultSettings,
        'custom',
        customProjectsCommandService,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
      ),
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

    expect(customProjectRepository.saveAll).not.toHaveBeenCalled()

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

    expect(customProjectRepository.saveAll).toHaveBeenCalledWith(
      projectSnapshot,
    )
    expect(toast.error).toHaveBeenCalledWith('保存データを復元できませんでした')
  })
})
