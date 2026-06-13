// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettings } from '@/types/storage'

const {
  useSortableMock,
  useDroppableMock,
  useCustomProjectCardMock,
  registerHandlersMock,
  unregisterHandlersMock,
} = vi.hoisted(() => ({
  useSortableMock: vi.fn(),
  useDroppableMock: vi.fn(),
  useCustomProjectCardMock: vi.fn(),
  registerHandlersMock: vi.fn(),
  unregisterHandlersMock: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: useSortableMock,
}))

vi.mock('@dnd-kit/core', () => ({
  useDroppable: useDroppableMock,
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({
    children,
    ...props
  }: { children: React.ReactNode } & Record<string, unknown>) => (
    <div data-testid='card' {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  // eslint-disable-next-line react/jsx-no-useless-fragment
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'ja',
    t: (key: string) =>
      (
        ({
          'common.manage': '管理',
          'savedTabs.collapse': '折りたたむ',
          'savedTabs.sort.default': 'デフォルト',
          'savedTabs.openAll': 'すべて開く',
          'savedTabs.openAllTabs': 'すべてのタブを開く',
          'savedTabs.deleteAll': 'すべて削除',
          'savedTabs.project.loadingTabs': 'タブを読み込み中...',
          'savedTabs.project.emptyTitle':
            'このプロジェクトにはタブがありません。',
          'savedTabs.project.emptyDescription':
            '拡張機能アイコンからタブを保存するか、右クリックメニューから追加できます。',
          'savedTabs.project.emptyDragHint':
            '他のプロジェクトからタブをドラッグ&ドロップして追加することもできます。',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

vi.mock('../../hooks/useCustomProjectCard', () => ({
  useCustomProjectCard: useCustomProjectCardMock,
}))

vi.mock('./ProjectCardContext', () => ({
  ProjectCardContext: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
}))

vi.mock('../DragHandlersContext', () => ({
  useDragHandlers: () => ({
    registerHandlers: registerHandlersMock,
    unregisterHandlers: unregisterHandlersMock,
  }),
}))

vi.mock('./ProjectManagementModal', () => ({
  ProjectManagementModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean
    onClose: () => void
  }) =>
    isOpen ? (
      <div>
        <button onClick={onClose} type='button'>
          close-management-modal
        </button>
      </div>
    ) : null,
}))

import { ProjectCardRoot } from './ProjectCardRoot'

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

const createHookState = () => ({
  urls: {
    projectUrls: [
      {
        url: 'https://example.com/one',
        title: 'One',
      },
      {
        url: 'https://example.com/two',
        title: 'Two',
      },
    ],
    setProjectUrls: vi.fn(),
    isLoadingUrls: false,
    uncategorizedUrls: [],
  },
  dnd: {
    handleCategoryDragEnd: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragStart: vi.fn(),
    handleUrlDragEnd: vi.fn(),
    resetDnD: vi.fn(),
  },
  categoryOrder: [],
})

type ProjectCardRootProps = React.ComponentProps<typeof ProjectCardRoot>
type ProjectCardRootOverrides = Omit<
  Partial<ProjectCardRootProps>,
  'project' | 'handlers' | 'hookHandlers'
> & {
  project?: Partial<ProjectCardRootProps['project']>
  handlers?: Partial<ProjectCardRootProps['handlers']>
  hookHandlers?: Partial<ProjectCardRootProps['hookHandlers']>
}

const createProps = (
  overrides: ProjectCardRootOverrides = {},
): ProjectCardRootProps => {
  const {
    project: projectOverrides,
    handlers: handlerOverrides,
    hookHandlers: hookHandlerOverrides,
    ...restOverrides
  } = overrides

  return {
    project: {
      id: projectOverrides?.id ?? 'project-1',
      name: projectOverrides?.name ?? 'Project A',
      categories: projectOverrides?.categories ?? [],
      createdAt: projectOverrides?.createdAt ?? 1,
      updatedAt: projectOverrides?.updatedAt ?? 1,
    },
    settings: defaultSettings,
    handlers: {
      handleAddCategory: vi.fn(),
      handleDeleteProject: vi.fn(),
      handleDeleteCategory: vi.fn(),
      handleDeleteUrl: vi.fn(),
      handleDeleteUrlsFromProject: vi.fn(),
      handleOpenAllUrls: vi.fn(),
      handleOpenUrl: vi.fn(),
      handleRenameCategory: vi.fn(),
      handleRenameProject: vi.fn(),
      handleSetUrlCategory: vi.fn(),
      ...handlerOverrides,
    },
    hookHandlers: {
      handleDeleteUrl: vi.fn(),
      handleReorderUrls: vi.fn(),
      handleSetUrlCategory: vi.fn(),
      handleUpdateCategoryOrder: vi.fn(),
      ...hookHandlerOverrides,
    },
    children: <div>children</div>,
    ...restOverrides,
  }
}

describe('ProjectCardRoot additional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSortableMock.mockReturnValue({
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
      attributes: {},
      listeners: {},
    })
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn(),
      isOver: false,
    })
    useCustomProjectCardMock.mockReturnValue(createHookState())
  })

  afterEach(() => {
    cleanup()
  })

  it('open all と管理モーダル close を処理する', async () => {
    const handleOpenAllUrls = vi.fn()

    render(
      <ProjectCardRoot
        {...createProps({
          handlers: {
            handleOpenAllUrls,
          },
        })}
      >
        <div>children</div>
      </ProjectCardRoot>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべてのタブを開く' }))
    expect(handleOpenAllUrls).toHaveBeenCalledWith([
      {
        url: 'https://example.com/one',
        title: 'One',
      },
      {
        url: 'https://example.com/two',
        title: 'Two',
      },
    ])

    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    expect(
      screen.getByRole('button', { name: 'close-management-modal' }),
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'close-management-modal' }),
    )
    await act(async () => {})
    expect(
      screen.queryByRole('button', { name: 'close-management-modal' }),
    ).toBeNull()
  })

  it('一括削除は project handler があればそれを使い、なければ hook handler を順に呼ぶ', async () => {
    vi.useFakeTimers()

    const handleDeleteUrlsFromProject = vi.fn().mockResolvedValue(undefined)
    const hookDeleteUrl = vi.fn()

    const { rerender } = render(
      <ProjectCardRoot
        {...createProps({
          handlers: {
            handleDeleteUrlsFromProject,
          },
          hookHandlers: {
            handleDeleteUrl: hookDeleteUrl,
            handleReorderUrls: vi.fn(),
            handleSetUrlCategory: vi.fn(),
            handleUpdateCategoryOrder: vi.fn(),
          },
        })}
      >
        <div>children</div>
      </ProjectCardRoot>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))
    await act(async () => {})
    expect(handleDeleteUrlsFromProject).toHaveBeenCalledWith('project-1', [
      'https://example.com/one',
      'https://example.com/two',
    ])

    rerender(
      <ProjectCardRoot
        {...createProps({
          handlers: {
            handleDeleteUrlsFromProject: undefined,
          },
          hookHandlers: {
            handleDeleteUrl: hookDeleteUrl,
            handleReorderUrls: vi.fn(),
            handleSetUrlCategory: vi.fn(),
            handleUpdateCategoryOrder: vi.fn(),
          },
        })}
      >
        <div>children</div>
      </ProjectCardRoot>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除' }))
    // eslint-disable-next-line typescript/require-await
    await act(async () => {
      vi.runAllTimers()
    })

    expect(hookDeleteUrl).toHaveBeenNthCalledWith(
      1,
      'project-1',
      'https://example.com/one',
    )
    expect(hookDeleteUrl).toHaveBeenNthCalledWith(
      2,
      'project-1',
      'https://example.com/two',
    )

    vi.useRealTimers()
  })
})
