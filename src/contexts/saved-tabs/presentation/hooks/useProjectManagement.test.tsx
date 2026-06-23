// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsUserSettingsDto as UserSettingsDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { CustomProject } from '@/types/storage'

import { useProjectManagement } from './useProjectManagement'

interface CustomProjectRawSnapshot {
  id: string
  name: string
  categories: readonly string[]
  createdAt: number
  updatedAt: number
  urlIds?: readonly string[]
  urls?: readonly {
    id?: string
    url: string
    title: string
    savedAt?: number
  }[]
  urlMetadata?: Readonly<Record<string, { notes?: string; category?: string }>>
  projectKeywords?: {
    urlKeywords: readonly string[]
    titleKeywords: readonly string[]
    domainKeywords: readonly string[]
  }
  categoryOrder?: readonly string[]
}

const projectManagementMocks = vi.hoisted(() => ({
  // issue #539 / #540 で application use-case へ移設した 10 操作の
  // use-case mock。`useProjectManagement` には use-case 関数として
  // 渡される。issue #540 で `addCategoryToProject` /
  // `removeCategoryFromProject` も use-case 化されたため、`addCategoryToCustomProject`
  // / `removeCategoryFromCustomProject` mock として独立した
  // deps に並ぶ。
  addCategoryToCustomProject: vi.fn(),
  removeCategoryFromCustomProject: vi.fn(),
  addUrlToCustomProject: vi.fn(),
  removeUrlFromCustomProject: vi.fn(),
  removeUrlsFromCustomProject: vi.fn(),
  setUrlCategory: vi.fn(),
  updateCategoryOrder: vi.fn(),
  reorderProjectUrls: vi.fn(),
  renameCategoryInProject: vi.fn(),
  updateProjectKeywords: vi.fn(),
  // 旧テスト互換: 実装は `getCustomProjectsQuery` (= `findAll`) を使う。
  // `getCustomProjects` というキー名で mock しても、
  // `findAll` の戻り値を `getCustomProjects` の戻り値に同期する実装で
  // そのまま動く。
  createCustomProject: vi.fn().mockResolvedValue({}),
  deleteCustomProject: vi.fn().mockResolvedValue({}),
  getCustomProjects: vi.fn(),
  updateCustomProjectName: vi.fn().mockResolvedValue({}),
  // 旧テスト互換: 実装は `saveCustomProjectOrderUseCase` (= `saveOrder`) を使う。
  // `getCustomProjectOrder` の戻り値も `findOrder` mock と同期して
  // 初期 load / undo snapshot で同じ order を返す。
  saveCustomProjectOrder: vi.fn(),
  getCustomProjectOrder: vi.fn(),
  getCustomProjectUndoSnapshot: vi.fn(),
  // 旧テスト互換: 旧 `customProjectRepository.restoreAllRaw` /
  // `saveOrder` を直接 mock していた検証を新 use-case 経由でも
  // 検証できるよう、use-case mock を expose する。
  restoreCustomProjectsSnapshot: vi.fn(),
  getCustomProjectRaws: vi.fn(),
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

const defaultSettings: UserSettingsDto = {
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

const toRawSnapshot = (project: CustomProject): CustomProjectRawSnapshot => {
  const result: CustomProjectRawSnapshot = {
    categories: project.categories,
    createdAt: project.createdAt,
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
  }
  if (project.urlIds) {
    result.urlIds = project.urlIds
  }
  if (project.urls) {
    result.urls = project.urls
  }
  if (project.urlMetadata) {
    result.urlMetadata = project.urlMetadata
  }
  if (project.projectKeywords) {
    result.projectKeywords = project.projectKeywords
  }
  if (project.categoryOrder) {
    result.categoryOrder = project.categoryOrder
  }
  return result
}

describe('useProjectManagement', () => {
  /**
   * issue #538 で `useProjectManagement` の deps から
   * `customProjectRepository` を撤去し、application query / use-case
   * 経由の依存に統一した。これらは `projectManagementMocks` 内の
   * 同名 mock 関数をそのまま参照する形に統一しつつ、presentation
   * 側で未使用の `removeUrlIdsFromAllCustomProjects` /
   * `removeUrlsFromAllCustomProjects` は no-op vi.fn で補完する。
   *
   * issue #540 で `useProjectManagement` から
   * `customProjectsCommandService` パラメータも完全に撤去された
   * (port 直接依存の 2 操作 `addCategoryToProject` /
   * `removeCategoryFromProject` も use-case 化された) ため、
   * `customProjectsCommandService` 変数は存在しない。
   */

  beforeEach(() => {
    for (const mock of Object.values(projectManagementMocks)) {
      mock.mockReset() // eslint-disable-line
    }
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'))
    // issue #535 P1: 実装は `findAllRaw` を介して rich フィールド
    // （`projectKeywords` / `categoryOrder` / `urlMetadata` / `urls`）を
    // 保持した raw snapshot を取得する。テストでは
    // `projectManagementMocks.getCustomProjects.mockResolvedValue(...)` で
    // 設定した `CustomProject` (storage 形) を raw snapshot 形に widen
    // して `getCustomProjectRaws` の戻り値にする。
    // issue #538 で `getCustomProjectRaws` (= `findAllRaw` 相当) は
    // application query 経由になったため、mock 関数 `getCustomProjectRaws`
    // を widening 担当として `getCustomProjects` ベースの結果を返す。
    const findAllMock = vi
      .fn()
      .mockImplementation(() => projectManagementMocks.getCustomProjects())
    const findAllRawMock = vi
      .fn()
      .mockImplementation(() =>
        projectManagementMocks
          .getCustomProjects()
          .then((projects: CustomProject[]) => projects.map(toRawSnapshot)),
      )

    const customProjectRepository = {
      findAll: findAllMock,
      findAllRaw: findAllRawMock,
      findById: vi.fn(),
      removeByIds: vi.fn(),
      restoreAllRaw: vi.fn(),
      saveAll: vi.fn(),
      findOrder: vi.fn(),
      saveOrder: vi.fn(),
    }
    ;(
      customProjectRepository.findOrder as unknown as {
        mockResolvedValue: (value: unknown) => void
      }
    ).mockResolvedValue([])
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

    // `getCustomProjectOrder` (= `findOrder` 相当) は
    // `projectManagementMocks.getCustomProjectOrder` を widening として
    // 委譲する。テストで `getCustomProjectOrder.mockResolvedValueOnce` /
    // `mockImplementationOnce` で一時的に上書きできる。
    projectManagementMocks.getCustomProjectOrder.mockImplementation(
      () =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        customProjectRepository.findOrder() as unknown as ReturnType<
          typeof projectManagementMocks.getCustomProjectOrder
        >,
    )
    // `saveCustomProjectOrder` (= `saveOrder` 相当) は
    // `customProjectRepository.saveOrder` を widening として委譲する。
    projectManagementMocks.saveCustomProjectOrder.mockImplementation(
      async (command: { newOrder: readonly string[] }) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        customProjectRepository.saveOrder(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          command.newOrder,
        ),
    )
    // `getCustomProjectRaws` は `customProjectRepository.findAllRaw` を
    // widening として委譲する。
    projectManagementMocks.getCustomProjectRaws.mockImplementation(async () =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (
        customProjectRepository.findAllRaw as () => Promise<
          readonly CustomProjectRawSnapshot[]
        >
      )(),
    )
    // `getCustomProjectUndoSnapshot` は `getCustomProjectRaws` /
    // `getCustomProjectOrder` 経由で取得する。これにより、テストで
    // `getCustomProjectRaws.mockImplementationOnce(...)` 等で
    // snapshot 取得タイミングの値を一時的に上書きできる。
    projectManagementMocks.getCustomProjectUndoSnapshot.mockImplementation(
      async () => {
        const order = await projectManagementMocks.getCustomProjectOrder()
        const base: { customProjectOrder?: readonly unknown[] } = {}
        if (order.length > 0) {
          base.customProjectOrder = order
        }
        const raws = await projectManagementMocks.getCustomProjectRaws()
        const projects: {
          categories: readonly string[]
          createdAt: number
          id: string
          name: string
          updatedAt: number
          urlIds: readonly string[]
        }[] = raws.map((raw: CustomProjectRawSnapshot) => ({
          categories: [...raw.categories],
          createdAt: raw.createdAt,
          id: raw.id,
          name: raw.name,
          updatedAt: raw.updatedAt,
          urlIds: [...(raw.urlIds ?? [])],
        }))
        return {
          ...base,
          ...(projects.length > 0 ? { customProjects: projects } : {}),
          ...(raws.length > 0 ? { customProjectsRaw: raws } : {}),
        }
      },
    )
    // `restoreCustomProjectsSnapshot` は payload を見て
    // `restoreAllRaw` / `saveAll` / `saveOrder` を委譲する。
    // 旧 `customProjectRepository.restoreAllRaw` / `saveAll` /
    // `saveOrder` を直接 mock していた検証を新 use-case mock 経由でも
    // 検証できるよう、repository mock と同期する。
    // `saveOrder` 部分は `saveCustomProjectOrder` use-case mock 経由で
    // 委譲し、presentation hook の `handleReorderProjects` 経路と
    // 同じ use-case を通る形に統一する。
    projectManagementMocks.restoreCustomProjectsSnapshot.mockImplementation(
      async (command: {
        payload: {
          customProjects?: readonly unknown[]
          customProjectsRaw?: readonly CustomProjectRawSnapshot[]
          customProjectOrder?: readonly unknown[]
        }
      }) => {
        const { payload } = command
        if (
          payload.customProjectsRaw &&
          customProjectRepository.restoreAllRaw
        ) {
          await customProjectRepository.restoreAllRaw(payload.customProjectsRaw)
        } else if (payload.customProjects) {
          await customProjectRepository.saveAll(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            payload.customProjects,
          )
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const order = (payload.customProjectOrder ??
          []) as unknown as readonly string[]
        await projectManagementMocks.saveCustomProjectOrder({ newOrder: order })
      },
    )

    projectManagementMocks.createCustomProject.mockResolvedValue({
      category: projectSnapshot[0],
      project: projectSnapshot[0],
    })
    projectManagementMocks.deleteCustomProject.mockResolvedValue(undefined)
    projectManagementMocks.updateCustomProjectName.mockResolvedValue({
      all: [projectSnapshot[0]],
      project: projectSnapshot[0],
    })
    // issue #540: `addCategoryToCustomProject` /
    // `removeCategoryFromCustomProject` は独立した use-case
    // deps として `useProjectManagement` に渡される。
    projectManagementMocks.addCategoryToCustomProject.mockResolvedValue(
      undefined,
    )
    projectManagementMocks.removeCategoryFromCustomProject.mockResolvedValue(
      undefined,
    )
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'domain',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
      async () =>
        new Promise<CustomProject[]>((resolve) => {
          resolveProjects = resolve
        }),
    )

    const { result: pendingResult, unmount } = renderHook(() =>
      useProjectManagement(
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
      ),
    )
    unmount()

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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'domain',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'domain',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        undefined,
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
      urlIds: [],
    }
    let resolveCreate: (value: { project: CustomProject }) => void = () =>
      undefined
    projectManagementMocks.createCustomProject.mockImplementation(
      async () =>
        new Promise<{ project: CustomProject }>((resolve) => {
          resolveCreate = resolve
        }),
    )

    const { result } = renderHook(() =>
      useProjectManagement(
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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

    expect(projectManagementMocks.addUrlToCustomProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      title: 'Example C',
      url: 'https://example.com/c',
    })
    expect(result.current.customProjects).toStrictEqual([projectWithCategories])

    await act(async () => {
      await result.current.handleDeleteProjectCategory('project-1', 'Inbox')
    })

    expect(
      projectManagementMocks.removeCategoryFromCustomProject,
    ).toHaveBeenCalledWith({ categoryName: 'Inbox', projectId: 'project-1' })
    expect(result.current.customProjects).toStrictEqual([])

    await act(async () => {
      await result.current.handleSetUrlCategory(
        'project-1',
        'https://example.com/a',
        'Done',
      )
    })

    expect(projectManagementMocks.setUrlCategory).toHaveBeenCalledWith({
      category: 'Done',
      projectId: 'project-1',
      url: 'https://example.com/a',
    })
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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

    expect(
      projectManagementMocks.addCategoryToCustomProject,
    ).toHaveBeenCalledWith({ categoryName: 'Review', projectId: 'project-2' })
    expect(projectManagementMocks.updateCategoryOrder).toHaveBeenCalledWith({
      newOrder: ['Review', 'Inbox'],
      projectId: 'project-2',
    })
    expect(projectManagementMocks.reorderProjectUrls).toHaveBeenCalledWith({
      projectId: 'project-2',
      urls: reorderedUrls,
    })
    expect(projectManagementMocks.saveCustomProjectOrder).toHaveBeenCalledWith({
      newOrder: ['project-1', 'project-2'],
    })
    expect(projectManagementMocks.renameCategoryInProject).toHaveBeenCalledWith(
      {
        newCategoryName: 'Later',
        oldCategoryName: 'Inbox',
        projectId: 'project-2',
      },
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
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
    projectManagementMocks.addCategoryToCustomProject.mockRejectedValue(
      new Error('add category failed'),
    )
    projectManagementMocks.removeCategoryFromCustomProject.mockRejectedValue(
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
    // `saveCustomProjectOrderUseCase` (= `customProjectRepository.saveOrder`)
    // を使うため、ここで reject。
    projectManagementMocks.saveCustomProjectOrder.mockRejectedValue(
      new Error('project order failed'),
    )
    projectManagementMocks.renameCategoryInProject.mockRejectedValue(
      new Error('category rename failed'),
    )

    const { result } = renderHook(() =>
      useProjectManagement(
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
    // PR #514 review P1: 初期 load 時に customProjectOrder を取り込み、
    // undo snapshot にも order を含める。
    projectManagementMocks.getCustomProjectOrder.mockResolvedValue([
      'project-1',
    ])

    const { result } = renderHook(() =>
      useProjectManagement(
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
    ).toHaveBeenCalledWith({
      projectId: 'project-1',
      url: 'https://example.com/a',
    })
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

    expect(
      projectManagementMocks.restoreCustomProjectsSnapshot,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          customProjects: expect.arrayContaining([
            expect.objectContaining({ id: 'project-1', name: 'Project A' }),
          ]),
          customProjectOrder: ['project-1'],
        }),
      }),
    )
    // `restoreCustomProjectsSnapshot` mock は `saveCustomProjectOrder` 経由
    // で `customProjectRepository.saveOrder` を委譲する実装なので、
    // payload 内の order が use-case 経由で `saveCustomProjectOrder` へ
    // 伝搬したことを検証する。
    expect(
      projectManagementMocks.saveCustomProjectOrder,
    ).toHaveBeenLastCalledWith({ newOrder: ['project-1'] })
    expect(result.current.customProjects).toStrictEqual(projectSnapshot)
  })

  it('Undo は生 snapshot があれば restoreCustomProjectsSnapshot 経由で urls / urlMetadata を含めて復元する（PR #506 review P2 対応）', async () => {
    // 生 snapshot にだけ存在する urls / urlMetadata / projectKeywords は
    // entity snapshot には載らないため、saveAll 経由だと merge で脱落する。
    // restoreCustomProjectsSnapshot 経由で書けば全フィールドを保存できる。
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
    // 1 回目: 初回 load, 2 回目: undo snapshot, 3 回目: 削除後
    // 初期 load / undo snapshot で rich な `projectSnapshotRaw` を返し、
    // 削除後の再取得は `getCustomProjects` (= []) ベースでよい。
    projectManagementMocks.getCustomProjectRaws.mockResolvedValue(
      projectSnapshotRaw,
    )

    const { result } = renderHook(() =>
      useProjectManagement(
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
      ),
    )

    // 初期ロード時に `getCustomProjectRaws` (= `findAllRaw`) 経由で rich な
    // snapshot が反映される
    // (issue #535 P1: projectKeywords / urlMetadata / urls が保持される)
    await waitFor(() => {
      expect(result.current.customProjects[0]?.projectKeywords).toStrictEqual({
        domainKeywords: ['example.com'],
        titleKeywords: ['design'],
        urlKeywords: ['plan'],
      })
    })

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

    expect(
      projectManagementMocks.restoreCustomProjectsSnapshot,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          customProjectsRaw: projectSnapshotRaw,
        }),
      }),
    )
  })

  it('カスタムモードの一括タブ削除を Undo で復元できる', async () => {
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot)
      .mockResolvedValueOnce([])

    const { result } = renderHook(() =>
      useProjectManagement(
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
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
    ).toHaveBeenCalledWith({
      projectId: 'project-1',
      urls: ['https://example.com/a', 'https://example.com/b'],
    })
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
    // 2nd delete: snapshot = projectSnapshot → 復元は失敗 → error toast
    // queue 設計:
    //  - 1st widening (useEffect): projectSnapshot
    //  - 2nd widening (1st delete snapshot): mockImplementationOnce で
    //    widening スキップ → queue 消費なし
    //  - 3rd widening (1st delete 削除後): []
    //  - 4th widening (2nd delete snapshot): projectSnapshot
    //  - 5th widening (2nd delete 削除後): projectSnapshot
    projectManagementMocks.getCustomProjects
      .mockResolvedValueOnce(projectSnapshot) // 1st: useEffect
      .mockResolvedValueOnce([]) // 3rd: 1st delete 削除後
      .mockResolvedValueOnce(projectSnapshot) // 4th: 2nd delete snapshot
      .mockResolvedValueOnce(projectSnapshot) // 5th: 2nd delete 削除後

    // issue #538: `restoreCustomProjectsSnapshot` use-case を 1 度だけ
    // reject させ、undo 復元の失敗 error toast を検証する。
    projectManagementMocks.restoreCustomProjectsSnapshot.mockImplementationOnce(
      async () => {
        throw new Error('restore failed')
      },
    )

    const { result } = renderHook(() =>
      useProjectManagement(
        projectManagementMocks.getCustomProjects,
        projectManagementMocks.getCustomProjectOrder,
        projectManagementMocks.getCustomProjectUndoSnapshot,
        projectManagementMocks.getCustomProjectRaws,
        [],
        defaultSettings,
        'custom',
        projectManagementMocks.createCustomProject,
        projectManagementMocks.deleteCustomProject,
        projectManagementMocks.updateCustomProjectName,
        projectManagementMocks.saveCustomProjectOrder,
        projectManagementMocks.restoreCustomProjectsSnapshot,
        // issue #539: 8 つの use-case を独立した deps として渡す。
        projectManagementMocks.addUrlToCustomProject,
        projectManagementMocks.removeUrlFromCustomProject,
        projectManagementMocks.removeUrlsFromCustomProject,
        projectManagementMocks.setUrlCategory,
        projectManagementMocks.updateCategoryOrder,
        projectManagementMocks.reorderProjectUrls,
        projectManagementMocks.renameCategoryInProject,
        projectManagementMocks.updateProjectKeywords,
        // issue #540: 2 つの use-case を独立した deps として渡す。
        projectManagementMocks.addCategoryToCustomProject,
        projectManagementMocks.removeCategoryFromCustomProject,
      ),
    )

    await waitForLoadedProjects(result)

    // 1st delete の `getCustomProjectUndoSnapshot` 内の
    // `getCustomProjects` を空にしておくと、undo snapshot に
    // `customProjectsRaw` / `customProjects` が含まれず、payload 化
    // で `null` が返り `restoreCustomProjectsSnapshot` 経路をスキップする。
    projectManagementMocks.getCustomProjectRaws.mockImplementationOnce(
      async () => [] as CustomProjectRawSnapshot[],
    )
    projectManagementMocks.getCustomProjects.mockImplementationOnce(
      async () => [] as CustomProject[],
    )

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

    expect(
      projectManagementMocks.restoreCustomProjectsSnapshot,
    ).not.toHaveBeenCalled()

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

    expect(
      projectManagementMocks.restoreCustomProjectsSnapshot,
    ).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('保存データを復元できませんでした')
  })
})
