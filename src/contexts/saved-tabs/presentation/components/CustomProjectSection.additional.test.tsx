// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { ProjectDragHandlers } from '@/contexts/saved-tabs/presentation/components/DragHandlersContext'
import type { CustomProjectSectionProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectSection.types'
import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

const { dndContextPropsRef, projectHandlerSpies } = vi.hoisted(() => ({
  dndContextPropsRef: {
    current: {} as {
      onDragEnd?: (event: unknown) => void
      onDragOver?: (event: unknown) => void
      onDragStart?: (event: unknown) => void
    },
  },
  projectHandlerSpies: {} as Record<
    string,
    {
      clearDragState: ReturnType<typeof vi.fn>
      handleCategoryDragEnd: ReturnType<typeof vi.fn>
      handleDragOver: ReturnType<typeof vi.fn>
      handleDragStart: ReturnType<typeof vi.fn>
      handleUrlDragEnd: ReturnType<typeof vi.fn>
    }
  >,
}))

const customProjectSectionAdditionalI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@dnd-kit/core', () => ({
  closestCenter: 'closestCenter',
  DndContext: ({
    children,
    onDragStart,
    onDragOver,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragStart?: (event: unknown) => void
    onDragOver?: (event: unknown) => void
    onDragEnd?: (event: unknown) => void
  }) => {
    dndContextPropsRef.current = {
      ...(onDragStart !== undefined ? { onDragStart } : {}),
      ...(onDragOver !== undefined ? { onDragOver } : {}),
      ...(onDragEnd !== undefined ? { onDragEnd } : {}),
    }
    return <div>{children}</div>
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => 'sensor'),
  useSensors: vi.fn(() => ['sensor']),
}))

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn((items: string[], from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: 'verticalListSortingStrategy',
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
  }) => (
    <div>
      <button onClick={() => onOpenChange?.(true)} type='button'>
        dialog-open
      </button>

      <button onClick={() => onOpenChange?.(false)} type='button'>
        dialog-close
      </button>
      {open ? children : null}
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: customProjectSectionAdditionalI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(
          customProjectSectionAdditionalI18nState.language,
        )
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

vi.mock('./CustomProjectCard', async () => {
  const [React, contextModule] = await Promise.all([
    // eslint-disable-next-line typescript/consistent-type-imports
    vi.importActual<typeof import('react')>('react'),
    // eslint-disable-next-line typescript/consistent-type-imports
    vi.importActual<typeof import('./DragHandlersContext')>(
      './DragHandlersContext',
    ),
  ])

  const CustomProjectCard = (props: {
    project: { id: string; name: string }
    isDropTarget?: boolean
  }) => {
    const context = React.useContext(contextModule.DragHandlersContext)

    React.useEffect(() => {
      const handlerSpies = {
        clearDragState: vi.fn(),
        handleCategoryDragEnd: vi.fn(),
        handleDragOver: vi.fn(),
        handleDragStart: vi.fn(),
        handleUrlDragEnd: vi.fn(),
      }
      projectHandlerSpies[props.project.id] = handlerSpies

      const handlers: ProjectDragHandlers = {
        clearDragState: () => {
          handlerSpies.clearDragState()
        },
        handleCategoryDragEnd: (event) => {
          handlerSpies.handleCategoryDragEnd(event)
        },
        handleDragOver: (event, project) => {
          handlerSpies.handleDragOver(event, project)
        },
        handleDragStart: (event) => {
          handlerSpies.handleDragStart(event)
        },
        handleUrlDragEnd: (event, isUncategorizedOver) => {
          handlerSpies.handleUrlDragEnd(event, isUncategorizedOver)
        },
      }

      context?.registerHandlers(props.project.id, handlers)

      return () => context?.unregisterHandlers(props.project.id)
    }, [context, props.project.id])

    return (
      <div
        data-drop-target={props.isDropTarget ? 'true' : 'false'}
        data-testid={`project-${props.project.id}`}
      >
        {props.project.name}
      </div>
    )
  }

  return { CustomProjectCard }
})

import { CustomProjectSection } from './CustomProjectSection'

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

const createProjects = () => [
  {
    id: 'project-1',
    name: 'Project One',
    categories: [],
    createdAt: 1,
    updatedAt: 1,
    urls: [],
  },
  {
    id: 'project-2',
    name: 'Project Two',
    categories: [],
    createdAt: 2,
    updatedAt: 2,
    urls: [],
  },
]

const createProps = (
  overrides: Partial<CustomProjectSectionProps> = {},
): CustomProjectSectionProps => ({
  projects: createProjects(),
  handleOpenUrl: vi.fn(),
  handleDeleteUrl: vi.fn(),
  handleAddUrl: vi.fn(),
  handleCreateProject: vi.fn(),
  handleDeleteProject: vi.fn(),
  handleRenameProject: vi.fn(),
  handleAddCategory: vi.fn(),
  handleDeleteCategory: vi.fn(),
  handleRenameCategory: vi.fn(),
  handleSetUrlCategory: vi.fn(),
  handleUpdateCategoryOrder: vi.fn(),
  handleReorderUrls: vi.fn(),
  handleReorderProjects: vi.fn(),
  handleOpenAllUrls: vi.fn(),
  handleMoveUrlBetweenProjects: vi.fn(),
  handleMoveUrlsBetweenCategories: vi.fn(),
  settings: defaultSettings,
  ...overrides,
})

describe('CustomProjectSection additional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dndContextPropsRef.current = {}
    for (const key of Object.keys(projectHandlerSpies)) {
      delete projectHandlerSpies[key]
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('create dialog の close と Enter 以外のキー分岐を処理する', async () => {
    const user = userEvent.setup()
    const handleCreateProject = vi.fn()

    render(
      <CustomProjectSection
        {...createProps({
          handleCreateProject,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'dialog-open' }))
    const nameInput = screen.getByLabelText('プロジェクト名 *')
    await user.clear(nameInput)
    await user.type(nameInput, 'Created Project')
    await user.type(nameInput, '{Escape}')
    expect(handleCreateProject).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(screen.queryByText('新規プロジェクト作成')).toBeNull()
  })

  it('子カードが drag handler を登録し、dragStart/dragOver/category dragEnd を伝播する', async () => {
    render(<CustomProjectSection {...createProps()} />)

    await act(async () => {})

    dndContextPropsRef.current.onDragStart?.({
      active: {
        data: {
          current: {
            projectId: 'project-1',
            type: 'url',
          },
        },
      },
    })
    expect(projectHandlerSpies['project-1']?.handleDragStart).toHaveBeenCalled()

    await act(async () => {
      dndContextPropsRef.current.onDragOver?.({
        active: {
          data: {
            current: {
              projectId: 'project-1',
              type: 'url',
            },
          },
        },
        over: {
          data: {
            current: {
              projectId: 'project-2',
            },
          },
        },
      })
    })

    expect(projectHandlerSpies['project-1']?.handleDragOver).toHaveBeenCalled()
    expect(projectHandlerSpies['project-2']?.handleDragOver).toHaveBeenCalled()
    expect(screen.getByTestId('project-project-2').dataset.dropTarget).toBe(
      'true',
    )

    dndContextPropsRef.current.onDragEnd?.({
      active: {
        data: {
          current: {
            projectId: 'project-1',
            type: 'category',
          },
        },
      },
    })

    expect(
      projectHandlerSpies['project-1']?.handleCategoryDragEnd,
    ).toHaveBeenCalled()
  })

  it('同一プロジェクト URL drop と cross-project drop、project reorder を処理する', async () => {
    const handleMoveUrlBetweenProjects = vi.fn()
    const handleReorderProjects = vi.fn()

    const { unmount } = render(
      <CustomProjectSection
        {...createProps({
          handleMoveUrlBetweenProjects,
          handleReorderProjects,
        })}
      />,
    )

    await act(async () => {})

    dndContextPropsRef.current.onDragEnd?.({
      active: {
        data: {
          current: {
            projectId: 'project-1',
            type: 'url',
          },
        },
        id: 'https://same-project.example.com',
      },
      over: {
        id: 'uncategorized-project-1',
        data: {
          current: {
            projectId: 'project-1',
            type: 'uncategorized',
          },
        },
      },
    })

    expect(
      projectHandlerSpies['project-1']?.handleUrlDragEnd,
    ).toHaveBeenCalledWith(expect.any(Object), true)

    dndContextPropsRef.current.onDragEnd?.({
      active: {
        data: {
          current: {
            projectId: 'project-1',
            type: 'url',
          },
        },
        id: 'https://cross-project.example.com',
      },
      over: {
        id: 'project-project-2',
        data: {
          current: {
            projectId: 'project-2',
          },
        },
      },
    })

    expect(handleMoveUrlBetweenProjects).toHaveBeenCalledWith(
      'project-1',
      'project-2',
      'https://cross-project.example.com',
    )
    expect(projectHandlerSpies['project-1']?.clearDragState).toHaveBeenCalled()

    await act(async () => {
      dndContextPropsRef.current.onDragStart?.({
        active: {
          data: {
            current: {
              projectId: 'project-1',
              type: 'project',
            },
          },
          id: 'project-1',
        },
      })
    })

    expect(screen.getByRole('button', { name: '折りたたむ' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'デフォルト' })).toBeTruthy()

    dndContextPropsRef.current.onDragEnd?.({
      active: {
        data: {
          current: {
            projectId: 'project-1',
            type: 'project',
          },
        },
        id: 'project-1',
      },
      over: {
        id: 'project-2',
      },
    })

    expect(handleReorderProjects).toHaveBeenCalledWith([
      'project-2',
      'project-1',
    ])

    unmount()
  })
})
