import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
// DnDのインポートを追加
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CustomProjectSectionProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectSection.types'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { CustomProjectCard } from './CustomProjectCard'
import { DragHandlersContext } from './DragHandlersContext'
import type { ProjectDragHandlers } from './DragHandlersContext'
import { CardCollapseControl } from './shared/CardCollapseControl'
import { CardGroupTitle } from './shared/CardGroupTitle'
import { CardSortControl } from './shared/CardSortControl'

type CreateProjectFormValues = {
  name: string
}

type ActiveDragData = {
  projectId?: string
  type?: string
  title?: string
  url?: string
}
type DragDebugPayload = {
  activeId: string
  activeType: string | null
  sourceProjectId: string | null
  overId: string | null
  overType: string | null
  overProjectId: string | null
  targetProjectId: string | null
}

let lastKnownActiveDragData: ActiveDragData | null = null

const noop = () => {}
const DRAG_OVERLAY_STYLE = { pointerEvents: 'none' as const }

const ProjectDragPreview = ({ project }: { project: CustomProject }) => {
  const badges = useMemo(
    () => <Badge variant='secondary'>{project.urls?.length ?? 0}</Badge>,
    [project.urls?.length],
  )

  return (
    <Card className='mb-4 w-full max-w-[600px] overflow-x-hidden shadow-md'>
      <CardHeader className='sticky top-0 z-50 my-2 flex-row items-baseline justify-between bg-card pl-1 text-foreground'>
        <div className='flex grow items-center gap-2'>
          <CardCollapseControl
            isCollapsed={false}
            setIsCollapsed={noop}
            setUserCollapsedState={noop}
            isDisabled
          />
          <CardSortControl sortOrder='default' setSortOrder={noop} />
          <CardGroupTitle
            title={project.name}
            badges={badges}
            className='py-2'
          />
        </div>
      </CardHeader>
    </Card>
  )
}

const resolveTargetProjectId = (over: DragEndEvent['over']): string | null => {
  // eslint-disable-next-line typescript/no-unsafe-assignment
  const overProjectId = over?.data.current?.projectId
  if (typeof overProjectId === 'string' && overProjectId.length > 0) {
    return overProjectId
  }

  if (typeof over?.id !== 'string') {
    return null
  }

  if (over.id.startsWith('project-header-')) {
    return over.id.slice('project-header-'.length)
  }
  if (over.id.startsWith('project-')) {
    return over.id.slice('project-'.length)
  }
  if (over.id.startsWith('uncategorized-')) {
    return over.id.slice('uncategorized-'.length)
  }
  return null
}

const parseActiveDragData = (value: unknown): ActiveDragData | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const projectId: unknown = Reflect.get(value, 'projectId')
  const type: unknown = Reflect.get(value, 'type')
  const title: unknown = Reflect.get(value, 'title')
  const url: unknown = Reflect.get(value, 'url')
  const hasRecognizedData =
    typeof projectId === 'string' ||
    typeof type === 'string' ||
    typeof title === 'string' ||
    typeof url === 'string'

  return hasRecognizedData
    ? {
        ...(typeof projectId === 'string' ? { projectId } : {}),
        ...(typeof title === 'string' ? { title } : {}),
        ...(typeof type === 'string' ? { type } : {}),
        ...(typeof url === 'string' ? { url } : {}),
      }
    : null
}

const resolveActiveDragData = (
  current: unknown,
  fallback: ActiveDragData | null,
): ActiveDragData | null =>
  parseActiveDragData(current) ?? fallback ?? lastKnownActiveDragData

// eslint-disable-next-line eslint/complexity
const buildDragDebugPayload = (
  activeId: string,
  activeData: ActiveDragData | null,
  over: DragEndEvent['over'],
): DragDebugPayload => ({
  activeId,
  activeType: activeData?.type ?? null,
  overId: typeof over?.id === 'string' ? over.id : null,
  overProjectId:
    typeof over?.data.current?.projectId === 'string'
      ? over.data.current.projectId
      : null,
  // eslint-disable-next-line typescript/no-unsafe-assignment
  overType: over?.data.current?.type ?? null,
  sourceProjectId: activeData?.projectId ?? null,
  targetProjectId: resolveTargetProjectId(over),
})

const updateCrossProjectDragState = ({
  activeData,
  over,
  setDraggedOverProjectId,
  setIsCrossProjectUrlDragActive,
}: {
  activeData: ActiveDragData | null
  over: DragOverEvent['over']
  setDraggedOverProjectId: React.Dispatch<React.SetStateAction<string | null>>
  setIsCrossProjectUrlDragActive: React.Dispatch<React.SetStateAction<boolean>>
}) => {
  if (!over || activeData?.type !== 'url') {
    setDraggedOverProjectId((prev) => (prev === null ? prev : null))
    return
  }

  const sourceProjectId = activeData.projectId
  // eslint-disable-next-line typescript/no-unsafe-assignment
  const projectId = over.data.current?.projectId
  if (projectId && sourceProjectId && projectId !== sourceProjectId) {
    // eslint-disable-next-line typescript/no-unsafe-return
    setDraggedOverProjectId((prev) => (prev === projectId ? prev : projectId))
    setIsCrossProjectUrlDragActive(true)
    return
  }

  setDraggedOverProjectId((prev) => (prev === null ? prev : null))
}

const resetSectionDragState = ({
  setIsProjectReorderMode,
  setIsCrossProjectUrlDragActive,
  setDraggedItem,
  setDraggedProject,
  setDraggedOverProjectId,
  activeDragDataRef,
  lastDragOverDebugRef,
}: {
  setIsProjectReorderMode: React.Dispatch<React.SetStateAction<boolean>>
  setIsCrossProjectUrlDragActive: React.Dispatch<React.SetStateAction<boolean>>
  setDraggedItem: React.Dispatch<
    React.SetStateAction<{
      url: string
      projectId: string
      title: string
    } | null>
  >
  setDraggedProject: React.Dispatch<React.SetStateAction<CustomProject | null>>
  setDraggedOverProjectId: React.Dispatch<React.SetStateAction<string | null>>
  activeDragDataRef: React.RefObject<ActiveDragData | null>
  lastDragOverDebugRef: React.RefObject<string | null>
}) => {
  setIsProjectReorderMode(false)
  setIsCrossProjectUrlDragActive(false)
  setDraggedItem(null)
  setDraggedProject(null)
  setDraggedOverProjectId(null)
  activeDragDataRef.current = null
  lastKnownActiveDragData = null
  lastDragOverDebugRef.current = null
}

const applyUrlDragStartState = ({
  activeId,
  projectId,
  title,
  url,
  setIsProjectReorderMode,
  setDraggedProject,
  setIsCrossProjectUrlDragActive,
  setDraggedOverProjectId,
  setDraggedItem,
}: {
  activeId: string
  projectId: string
  title?: string
  url?: string
  setIsProjectReorderMode: React.Dispatch<React.SetStateAction<boolean>>
  setDraggedProject: React.Dispatch<React.SetStateAction<CustomProject | null>>
  setIsCrossProjectUrlDragActive: React.Dispatch<React.SetStateAction<boolean>>
  setDraggedOverProjectId: React.Dispatch<React.SetStateAction<string | null>>
  setDraggedItem: React.Dispatch<
    React.SetStateAction<{
      url: string
      projectId: string
      title: string
    } | null>
  >
}) => {
  setIsProjectReorderMode(false)
  setDraggedProject(null)
  setIsCrossProjectUrlDragActive(false)
  setDraggedOverProjectId(null)
  setDraggedItem({
    projectId,
    title: title ?? '',
    url: url ?? activeId,
  })
}

const applyProjectDragStartState = ({
  projectId,
  projects,
  setDraggedItem,
  setIsProjectReorderMode,
  setDraggedProject,
}: {
  projectId: string
  projects: CustomProject[]
  setDraggedItem: React.Dispatch<
    React.SetStateAction<{
      url: string
      projectId: string
      title: string
    } | null>
  >
  setIsProjectReorderMode: React.Dispatch<React.SetStateAction<boolean>>
  setDraggedProject: React.Dispatch<React.SetStateAction<CustomProject | null>>
}) => {
  setDraggedItem(null)
  const project = projects.find(
    (currentProject) => currentProject.id === projectId,
  )
  if (project) {
    setIsProjectReorderMode(true)
    setDraggedProject(project)
  }
}

// eslint-disable-next-line eslint/complexity
const handleDragEndByType = ({
  activeId,
  activeData,
  event,
  over,
  projects,
  projectDragHandlersRef,
  handleReorderProjects,
  handleUrlDragSequence,
}: {
  activeId: string
  activeData: ActiveDragData | null
  event: DragEndEvent
  over: DragEndEvent['over']
  projects: CustomProject[]
  projectDragHandlersRef: React.RefObject<
    Partial<Record<string, ProjectDragHandlers>>
  >
  handleReorderProjects?: (newOrder: string[]) => void | Promise<void>
  handleUrlDragSequence: (event: DragEndEvent) => void
}) => {
  if (activeData?.type === 'url') {
    handleUrlDragSequence(event)
    return
  }

  if (activeData?.type === 'category') {
    const sourceProjectId = activeData.projectId
    if (sourceProjectId && projectDragHandlersRef.current[sourceProjectId]) {
      projectDragHandlersRef.current[sourceProjectId].handleCategoryDragEnd(
        event,
      )
    }
    return
  }

  if (activeData?.type !== 'project' || !over || activeId === String(over.id)) {
    return
  }

  const oldIndex = projects.findIndex((project) => project.id === activeId)
  const newIndex = projects.findIndex((project) => project.id === over.id)

  if (oldIndex !== -1 && newIndex !== -1 && handleReorderProjects) {
    void handleReorderProjects(
      arrayMove(
        projects.map((project) => project.id),
        oldIndex,
        newIndex,
      ),
    )
  }
}

const CreateProjectDialogContent = ({
  t,
  handleFormSubmit,
  nameField,
  handleNameKeyDown,
  nameError,
  closeCreateDialog,
  handleCreateButtonClick,
}: {
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
  handleFormSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void
  nameField: UseFormRegisterReturn<'name'>
  handleNameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  nameError: string | null
  closeCreateDialog: () => void
  handleCreateButtonClick: () => void
}) => (
  <DialogContent>
    <DialogHeader>
      <DialogTitle>
        {t('savedTabs.customProjects.createDialogTitle')}
      </DialogTitle>
    </DialogHeader>
    <form onSubmit={handleFormSubmit}>
      <div className='grid gap-4 py-4'>
        <div>
          <Label htmlFor='name'>
            {t('savedTabs.customProjects.nameLabel')}
          </Label>
          <Input
            id='name'
            {...nameField}
            onKeyDown={handleNameKeyDown}
            placeholder={t('savedTabs.customProjects.createPlaceholder')}
            className={`w-full ${nameError ? 'border-red-500' : ''}`}
          />
          {nameError && (
            <p className='mt-1 text-xs text-red-500'>{nameError}</p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant='ghost' type='button' onClick={closeCreateDialog}>
          {t('common.cancel')}
        </Button>
        <Button type='button' onClick={handleCreateButtonClick}>
          {t('savedTabs.customProjects.createAction')}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
)

const useCustomProjectSectionView = ({
  // eslint-disable-line eslint/max-lines-per-function
  projects,
  handleOpenUrl,
  handleDeleteUrl,
  handleDeleteUrlsFromProject,
  handleAddUrl,
  handleCreateProject,
  handleDeleteProject,
  handleRenameProject,
  handleUpdateProjectKeywords,
  handleAddCategory,
  handleDeleteCategory,
  handleRenameCategory, // 追加: カテゴリ名変更ハンドラ
  handleSetUrlCategory,
  handleUpdateCategoryOrder,
  handleReorderUrls,
  handleReorderProjects, // 追加: プロジェクト順序の更新ハンドラ
  handleOpenAllUrls,
  handleMoveUrlBetweenProjects, // 新しいプロパティを受け取る
  handleMoveUrlsBetweenCategories, // カテゴリ間移動
  getProjectUrlsUseCase,
  settings,
}: CustomProjectSectionProps) => {
  const { t } = useI18n()
  const projectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  )
  const createProjectSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t('savedTabs.projectNameRequired')),
      }),
    [t],
  )
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<CreateProjectFormValues>({
    defaultValues: {
      name: '',
    },
    reValidateMode: 'onChange',
    resolver: zodResolver(createProjectSchema),
  })
  const nameError = errors.name?.message ?? null

  // ドラッグ中のアイテムの状態
  const [draggedItem, setDraggedItem] = useState<{
    url: string
    projectId: string
    title: string
  } | null>(null)

  // ドラッグ中のプロジェクトの状態を追加
  const [draggedProject, setDraggedProject] = useState<CustomProject | null>(
    null,
  )
  const [isProjectReorderMode, setIsProjectReorderMode] = useState(false)
  const [isCrossProjectUrlDragActive, setIsCrossProjectUrlDragActive] =
    useState(false)

  // ドラッグオーバー中のプロジェクトIDを管理
  const [draggedOverProjectId, setDraggedOverProjectId] = useState<
    string | null
  >(null)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const projectDragHandlersRef = useRef<
    Partial<Record<string, ProjectDragHandlers>>
  >({})
  const activeDragDataRef = useRef<ActiveDragData | null>(null)
  const lastDragOverDebugRef = useRef<string | null>(null)

  const dragHandlersContextValue = useMemo(
    () => ({
      registerHandlers: (projectId: string, handlers: ProjectDragHandlers) => {
        projectDragHandlersRef.current[projectId] = handlers
      },
      unregisterHandlers: (projectId: string) => {
        const newHandlers = { ...projectDragHandlersRef.current }

        Reflect.deleteProperty(newHandlers, projectId)
        projectDragHandlersRef.current = newHandlers
      },
    }),
    [],
  )

  const closeCreateDialog = useCallback(() => {
    setIsCreateDialogOpen(false)
    reset()
  }, [reset])

  const handleCreateDialogChange = useCallback(
    (open: boolean) => {
      setIsCreateDialogOpen(open)
      if (!open) {
        reset()
      }
    },
    [reset],
  )

  const handleCreateProjectSubmit = useCallback(
    ({ name }: CreateProjectFormValues) => {
      const trimmedName = name.trim()

      if (
        projects.some((p) => p.name.toLowerCase() === trimmedName.toLowerCase())
      ) {
        setError('name', {
          message: t('savedTabs.projects.duplicateName', undefined, {
            name: trimmedName,
          }),
          type: 'manual',
        })
        return
      }

      handleCreateProject(trimmedName)
      closeCreateDialog()
    },
    [projects, setError, t, handleCreateProject, closeCreateDialog],
  )

  const nameField = register('name', {
    onChange: () => {
      clearErrors('name')
    },
  })
  const handleNameKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return
      }
      event.preventDefault()
      void handleSubmit(handleCreateProjectSubmit)()
    },
    [handleSubmit, handleCreateProjectSubmit],
  )

  const handleCreateButtonClick = useCallback(() => {
    void handleSubmit(handleCreateProjectSubmit)()
  }, [handleSubmit, handleCreateProjectSubmit])

  // ドラッグ開始時の処理
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = parseActiveDragData(event.active.data.current)
      if (!activeData?.projectId) {
        return
      }
      const { projectId, type, title, url } = activeData

      activeDragDataRef.current = {
        projectId,
        ...(title !== undefined ? { title } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(url !== undefined ? { url } : {}),
      }
      lastKnownActiveDragData = {
        projectId,
        ...(title !== undefined ? { title } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(url !== undefined ? { url } : {}),
      }

      if (type === 'url') {
        applyUrlDragStartState({
          activeId: String(event.active.id),
          projectId,
          setDraggedItem,
          setDraggedOverProjectId,
          setDraggedProject,
          setIsCrossProjectUrlDragActive,
          setIsProjectReorderMode,
          ...(title !== undefined ? { title } : {}),
          ...(url !== undefined ? { url } : {}),
        })
      } else if (type === 'project') {
        applyProjectDragStartState({
          projectId,
          projects,
          setDraggedItem,
          setDraggedProject,
          setIsProjectReorderMode,
        })
      }

      // プロジェクトへ伝播
      const handler = projectDragHandlersRef.current[projectId]
      if (handler) {
        handler.handleDragStart(event)
      }
    },
    [projects],
  )

  // ドラッグオーバー時の処理
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      const activeData = resolveActiveDragData(
        active.data.current,
        activeDragDataRef.current,
      )
      const debugPayload = buildDragDebugPayload(
        String(active.id),
        activeData,
        over,
      )
      const debugSignature = JSON.stringify(debugPayload)

      if (lastDragOverDebugRef.current !== debugSignature) {
        lastDragOverDebugRef.current = debugSignature
      }

      updateCrossProjectDragState({
        activeData,
        over,
        setDraggedOverProjectId,
        setIsCrossProjectUrlDragActive,
      })

      // 全てのプロジェクトへ伝播させる (hoverが外れたことを伝えるため)
      Object.entries(projectDragHandlersRef.current).forEach(
        ([id, handlers]) => {
          const project = projects.find((p) => p.id === id)
          if (project && handlers) {
            handlers.handleDragOver(event, project)
          }
        },
      )
    },
    [projects],
  )

  // プロジェクト間のURL移動
  const handleUrlCrossProjectDragEnd = useCallback(
    (event: DragEndEvent, targetProjectId: string, sourceProjectId: string) => {
      const { active } = event
      const activeData = resolveActiveDragData(
        active.data.current,
        activeDragDataRef.current,
      )
      const draggedUrl = activeData?.url ?? String(active.id)

      if (handleMoveUrlBetweenProjects) {
        handleMoveUrlBetweenProjects(
          sourceProjectId,
          targetProjectId,
          draggedUrl,
        )
      }
    },
    [handleMoveUrlBetweenProjects],
  )

  // URLドラッグに関わるシーケンス制御
  // eslint-disable-next-line eslint/complexity
  const handleUrlDragSequence = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      const activeData = resolveActiveDragData(
        active.data.current,
        activeDragDataRef.current,
      )
      const sourceProjectId = activeData?.projectId ?? ''
      const targetProjectId = resolveTargetProjectId(over)

      if (
        !targetProjectId ||
        (sourceProjectId && sourceProjectId === targetProjectId)
      ) {
        // 同一プロジェクト内または無効なドロップエリア
        if (
          sourceProjectId &&
          projectDragHandlersRef.current[sourceProjectId]
        ) {
          const isUncategorizedOver =
            over?.id === `uncategorized-${targetProjectId ?? ''}` ||
            over?.data.current?.type === 'uncategorized'
          projectDragHandlersRef.current[sourceProjectId].handleUrlDragEnd(
            event,
            isUncategorizedOver,
          )
        }
      } else {
        // クロスプロジェクトドロップ
        handleUrlCrossProjectDragEnd(event, targetProjectId, sourceProjectId)

        // 元プロジェクトの状態リセット
        if (
          sourceProjectId &&
          projectDragHandlersRef.current[sourceProjectId]
        ) {
          projectDragHandlersRef.current[sourceProjectId].clearDragState()
        }
      }
    },
    [handleUrlCrossProjectDragEnd],
  )

  // ドラッグ終了時の処理
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      const activeData = resolveActiveDragData(
        active.data.current,
        activeDragDataRef.current,
      )
      handleDragEndByType({
        activeData,
        activeId: String(active.id),
        event,
        ...(handleReorderProjects !== undefined
          ? { handleReorderProjects }
          : {}),
        handleUrlDragSequence,
        over,
        projectDragHandlersRef,
        projects,
      })

      resetSectionDragState({
        activeDragDataRef,
        lastDragOverDebugRef,
        setDraggedItem,
        setDraggedOverProjectId,
        setDraggedProject,
        setIsCrossProjectUrlDragActive,
        setIsProjectReorderMode,
      })
    },
    [handleReorderProjects, handleUrlDragSequence, projects],
  )

  const handleFormSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      void handleSubmit(handleCreateProjectSubmit)(e)
    },
    [handleSubmit, handleCreateProjectSubmit],
  )

  return (
    <div>
      {projects.length > 0 ? (
        <DragHandlersContext.Provider value={dragHandlersContextValue}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={projectIds}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {projects.map((project) => (
                  <CustomProjectCard
                    project={project}
                    handleOpenUrl={handleOpenUrl}
                    handleDeleteUrl={handleDeleteUrl}
                    {...(handleDeleteUrlsFromProject !== undefined
                      ? { handleDeleteUrlsFromProject }
                      : {})}
                    handleAddUrl={handleAddUrl}
                    handleDeleteProject={handleDeleteProject}
                    handleRenameProject={handleRenameProject}
                    {...(handleUpdateProjectKeywords !== undefined
                      ? { handleUpdateProjectKeywords }
                      : {})}
                    handleAddCategory={handleAddCategory}
                    handleDeleteCategory={handleDeleteCategory}
                    {...(handleRenameCategory !== undefined
                      ? { handleRenameCategory }
                      : {})}
                    handleSetUrlCategory={handleSetUrlCategory}
                    handleUpdateCategoryOrder={handleUpdateCategoryOrder}
                    handleReorderUrls={handleReorderUrls}
                    {...(handleOpenAllUrls !== undefined
                      ? { handleOpenAllUrls }
                      : {})}
                    settings={settings}
                    // ドラッグ中のアイテム情報を渡す
                    draggedItem={draggedItem}
                    // ドラッグオーバー中のプロジェクトIDを渡す
                    isDropTarget={draggedOverProjectId === project.id}
                    isProjectReorderMode={isProjectReorderMode}
                    isCrossProjectUrlDragActive={isCrossProjectUrlDragActive}
                    {...(getProjectUrlsUseCase !== undefined
                      ? { getProjectUrlsUseCase }
                      : {})}
                    {...(handleMoveUrlsBetweenCategories !== undefined
                      ? { handleMoveUrlsBetweenCategories }
                      : {})}
                    {...(handleMoveUrlBetweenProjects !== undefined
                      ? { handleMoveUrlBetweenProjects }
                      : {})}
                    key={project.id}
                  />
                ))}
              </div>
            </SortableContext>
            {/* ドラッグ中の要素のオーバーレイ */}
            <DragOverlay style={DRAG_OVERLAY_STYLE}>
              {draggedItem && (
                <div className='max-w-[300px] truncate rounded-md border bg-background p-2 shadow-md'>
                  {draggedItem.title || draggedItem.url}
                </div>
              )}
              {draggedProject && (
                <ProjectDragPreview project={draggedProject} />
              )}
            </DragOverlay>
          </DndContext>
        </DragHandlersContext.Provider>
      ) : (
        <div className='flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-md border p-8'>
          <div className='text-2xl text-foreground'>
            {t('savedTabs.customProjects.emptyTitle')}
          </div>
          <div
            className='text-center text-muted-foreground'
            data-testid='empty-state-description'
          >
            {t('savedTabs.customProjects.emptyDescription')}
            <br />
            {t('savedTabs.customProjects.emptyHint')}
          </div>
          {/* 新規プロジェクト作成ボタンも非表示に
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus size={16} className='mr-1' />
            新規プロジェクト
          </Button>
          */}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
        <CreateProjectDialogContent
          t={t}
          handleFormSubmit={handleFormSubmit}
          nameField={nameField}
          handleNameKeyDown={handleNameKeyDown}
          nameError={nameError}
          closeCreateDialog={closeCreateDialog}
          handleCreateButtonClick={handleCreateButtonClick}
        />
      </Dialog>
    </div>
  )
}
export const CustomProjectSection = (props: CustomProjectSectionProps) =>
  useCustomProjectSectionView(props)
