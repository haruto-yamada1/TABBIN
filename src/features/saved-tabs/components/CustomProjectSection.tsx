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
import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
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
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { CustomProject } from '@/types/storage'

import { DragHandlersContext } from '../contexts/DragHandlersContext'
import type { ProjectDragHandlers } from '../contexts/DragHandlersContext'
import type { CustomProjectSectionProps } from '../types/CustomProjectSection.types'
import { CustomProjectCard } from './CustomProjectCard'
import { CardCollapseControl } from './shared/CardCollapseControl'
import { CardGroupTitle } from './shared/CardGroupTitle'
import { CardSortControl } from './shared/CardSortControl'

interface CreateProjectFormValues {
  name: string
}

interface ActiveDragData {
  projectId?: string
  type?: string
  title?: string
  url?: string
}
interface DragDebugPayload {
  activeId: string
  activeType: string | null
  sourceProjectId: string | null
  overId: string | null
  overType: string | null
  overProjectId: string | null
  targetProjectId: string | null
}

let lastKnownActiveDragData: ActiveDragData | null = null

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
            // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
            setIsCollapsed={() => {}}
            // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
            setUserCollapsedState={() => {}}
            isDisabled
          />
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          <CardSortControl sortOrder='default' setSortOrder={() => {}} />
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
  const overProjectId = over?.data?.current?.projectId
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

  const candidate = value as ActiveDragData
  const hasRecognizedData =
    typeof candidate.projectId === 'string' ||
    typeof candidate.type === 'string' ||
    typeof candidate.title === 'string' ||
    typeof candidate.url === 'string'

  return hasRecognizedData ? candidate : null
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
    typeof over?.data?.current?.projectId === 'string'
      ? over.data.current.projectId
      : null,
  // eslint-disable-next-line typescript/no-unsafe-assignment
  overType: over?.data?.current?.type ?? null,
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
  const projectId = over.data?.current?.projectId
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
  projectDragHandlersRef: React.RefObject<Record<string, ProjectDragHandlers>>
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
    // eslint-disable-next-line typescript/no-floating-promises
    handleReorderProjects(
      arrayMove(
        projects.map((project) => project.id),
        oldIndex,
        newIndex,
      ),
    )
  }
}

const useCustomProjectSectionView = ({
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
  settings,
}: CustomProjectSectionProps) => {
  const { t } = useI18n()
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

  const projectDragHandlersRef = useRef<Record<string, ProjectDragHandlers>>({})
  const activeDragDataRef = useRef<ActiveDragData | null>(null)
  const lastDragOverDebugRef = useRef<string | null>(null)

  const dragHandlersContextValue = useMemo(
    () => ({
      registerHandlers: (projectId: string, handlers: ProjectDragHandlers) => {
        projectDragHandlersRef.current[projectId] = handlers
      },
      unregisterHandlers: (projectId: string) => {
        const newHandlers = { ...projectDragHandlersRef.current }
        // eslint-disable-next-line typescript/no-dynamic-delete
        delete newHandlers[projectId]
        projectDragHandlersRef.current = newHandlers
      },
    }),
    [],
  )

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const closeCreateDialog = () => {
    setIsCreateDialogOpen(false)
    reset()
  }

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleCreateDialogChange = (open: boolean) => {
    setIsCreateDialogOpen(open)
    if (!open) {
      reset()
    }
  }

  const handleCreateProjectSubmit = ({ name }: CreateProjectFormValues) => {
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
  }

  const nameField = register('name', {
    onChange: () => {
      clearErrors('name')
    },
  })
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    void handleSubmit(handleCreateProjectSubmit)()
  }

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleCreateButtonClick = () => {
    void handleSubmit(handleCreateProjectSubmit)()
  }

  // ドラッグ開始時の処理
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDragStart = (event: DragStartEvent) => {
    const activeData = parseActiveDragData(event.active.data.current)
    if (!activeData?.projectId) {
      return
    }
    const { projectId, type, title, url } = activeData

    activeDragDataRef.current = {
      projectId,
      title,
      type,
      url,
    }
    lastKnownActiveDragData = {
      projectId,
      title,
      type,
      url,
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
        title,
        url,
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
  }

  // ドラッグオーバー時の処理
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDragOver = (event: DragOverEvent) => {
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
    Object.entries(projectDragHandlersRef.current).forEach(([id, handlers]) => {
      const project = projects.find((p) => p.id === id)
      if (project) {
        handlers.handleDragOver(event, project)
      }
    })
  }

  // ドラッグ終了時の処理
  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const activeData = resolveActiveDragData(
      active.data.current,
      activeDragDataRef.current,
    )
    handleDragEndByType({
      activeData,
      activeId: String(active.id),
      event,
      handleReorderProjects,
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
  }

  // URLドラッグに関わるシーケンス制御
  // eslint-disable-next-line eslint/complexity
  const handleUrlDragSequence = (event: DragEndEvent) => {
    const { active, over } = event
    const activeData = resolveActiveDragData(
      active.data.current,
      activeDragDataRef.current,
    )
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    const sourceProjectId = activeData?.projectId as string
    const targetProjectId = resolveTargetProjectId(over)

    if (
      !targetProjectId ||
      (sourceProjectId && sourceProjectId === targetProjectId)
    ) {
      // 同一プロジェクト内または無効なドロップエリア
      if (sourceProjectId && projectDragHandlersRef.current[sourceProjectId]) {
        const isUncategorizedOver =
          over?.id === `uncategorized-${targetProjectId}` ||
          over?.data?.current?.type === 'uncategorized'
        projectDragHandlersRef.current[sourceProjectId].handleUrlDragEnd(
          event,
          isUncategorizedOver,
        )
      }
    } else {
      // クロスプロジェクトドロップ
      handleUrlCrossProjectDragEnd(event, targetProjectId, sourceProjectId)

      // 元プロジェクトの状態リセット
      if (sourceProjectId && projectDragHandlersRef.current[sourceProjectId]) {
        projectDragHandlersRef.current[sourceProjectId].clearDragState()
      }
    }
  }

  // プロジェクト間のURL移動
  const handleUrlCrossProjectDragEnd = (
    event: DragEndEvent,
    targetProjectId: string,
    sourceProjectId: string,
  ) => {
    const { active } = event
    const activeData = resolveActiveDragData(
      active.data.current,
      activeDragDataRef.current,
    )
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    const draggedUrl = activeData?.url ?? (active.id as string)

    if (handleMoveUrlBetweenProjects) {
      handleMoveUrlBetweenProjects(sourceProjectId, targetProjectId, draggedUrl)
    }
  }

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
              // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
              items={projects.map((project) => project.id)}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {projects.map((project) => (
                  <CustomProjectCard
                    key={project.id}
                    project={project}
                    handleOpenUrl={handleOpenUrl}
                    handleDeleteUrl={handleDeleteUrl}
                    handleDeleteUrlsFromProject={handleDeleteUrlsFromProject}
                    handleAddUrl={handleAddUrl}
                    handleDeleteProject={handleDeleteProject}
                    handleRenameProject={handleRenameProject}
                    handleUpdateProjectKeywords={handleUpdateProjectKeywords}
                    handleAddCategory={handleAddCategory}
                    handleDeleteCategory={handleDeleteCategory}
                    handleRenameCategory={handleRenameCategory} // 追加: カテゴリ名変更ハンドラ
                    handleSetUrlCategory={handleSetUrlCategory}
                    handleUpdateCategoryOrder={handleUpdateCategoryOrder}
                    handleReorderUrls={handleReorderUrls}
                    handleOpenAllUrls={handleOpenAllUrls}
                    settings={settings}
                    // ドラッグ中のアイテム情報を渡す
                    draggedItem={draggedItem}
                    // ドラッグオーバー中のプロジェクトIDを渡す
                    isDropTarget={draggedOverProjectId === project.id}
                    isProjectReorderMode={isProjectReorderMode}
                    isCrossProjectUrlDragActive={isCrossProjectUrlDragActive}
                    handleMoveUrlsBetweenCategories={
                      handleMoveUrlsBetweenCategories
                    }
                    handleMoveUrlBetweenProjects={handleMoveUrlBetweenProjects} // 追加: プロジェクト間URL移動を渡す
                  />
                ))}
              </div>
            </SortableContext>
            {/* ドラッグ中の要素のオーバーレイ */}
            // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
            <DragOverlay style={{ pointerEvents: 'none' }}>
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
          <div className='text-center text-muted-foreground'>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('savedTabs.customProjects.createDialogTitle')}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              void handleSubmit(handleCreateProjectSubmit)(e)
            }}
          >
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
      </Dialog>
    </div>
  )
}
export const CustomProjectSection = (props: CustomProjectSectionProps) =>
  useCustomProjectSectionView(props)
