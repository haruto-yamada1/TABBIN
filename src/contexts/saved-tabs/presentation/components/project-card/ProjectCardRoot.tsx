import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import { useDragHandlers } from '@/contexts/saved-tabs/presentation/components/DragHandlersContext'
import { CardCollapseControl } from '@/contexts/saved-tabs/presentation/components/shared/CardCollapseControl'
import { CardGroupActions } from '@/contexts/saved-tabs/presentation/components/shared/CardGroupActions'
import { CardGroupTitle } from '@/contexts/saved-tabs/presentation/components/shared/CardGroupTitle'
import { CardSortControl } from '@/contexts/saved-tabs/presentation/components/shared/CardSortControl'
import { useCustomProjectCard } from '@/contexts/saved-tabs/presentation/hooks/useCustomProjectCard'
import type { SortOrder } from '@/contexts/saved-tabs/presentation/hooks/useSortOrder'
import type { CustomProjectCardProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectCard.types'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { ProjectCardContext } from './ProjectCardContext'
import type { ProjectCardContextType } from './ProjectCardContext'
import { ProjectManagementModal } from './ProjectManagementModal'

const BULK_OPEN_THRESHOLD = 10

const sortProjectUrls = <
  T extends {
    savedAt?: number
  },
>(
  urls: T[],
  sortOrder: SortOrder,
) => {
  if (sortOrder === 'default') {
    return urls
  }

  const sortedUrls = [...urls]
  sortedUrls.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0))
  if (sortOrder === 'desc') {
    sortedUrls.reverse()
  }

  return sortedUrls
}

/** ProjectCardRoot の props */
interface ProjectCardRootProps {
  /** プロジェクトデータ */
  project: CustomProjectCardProps['project']
  /** 設定 */
  settings: CustomProjectCardProps['settings']
  /** ドラッグ中アイテム */
  draggedItem?: CustomProjectCardProps['draggedItem']
  /** ドロップターゲットか */
  isDropTarget?: boolean
  /** プロジェクト並び替え中か */
  isProjectReorderMode?: boolean
  /** URL のクロスプロジェクトドラッグ中か */
  isCrossProjectUrlDragActive?: boolean
  /** 操作ハンドラ */
  handlers: ProjectCardContextType['handlers']
  /** UseCustomProjectCard に渡すハンドラ */
  hookHandlers: {
    handleDeleteUrl: CustomProjectCardProps['handleDeleteUrl']
    handleSetUrlCategory: CustomProjectCardProps['handleSetUrlCategory']
    handleUpdateCategoryOrder: CustomProjectCardProps['handleUpdateCategoryOrder']
    handleReorderUrls: CustomProjectCardProps['handleReorderUrls']
  }
  /** プロジェクト URL 取得 use-case。useCustomProjectCard へ伝搬。*/
  getProjectUrlsUseCase?: GetProjectUrlsUseCase
  /** 子コンポーネント */
  children: React.ReactNode
}

/**
 * ProjectCard の複合コンポーネントルート
 * Card + useSortable + useDroppable + useCustomProjectCard + DndContext を提供する
 * @param props ProjectCardRootProps
 */
// eslint-disable-next-line eslint/complexity
export const ProjectCardRoot = ({
  // eslint-disable-line eslint/max-lines-per-function
  project,
  settings,
  isDropTarget = false,
  isProjectReorderMode = false,
  isCrossProjectUrlDragActive = false,
  handlers,
  hookHandlers,
  getProjectUrlsUseCase,
  children,
}: ProjectCardRootProps) => {
  const { t } = useI18n()
  const hookState = useCustomProjectCard({
    getProjectUrlsUseCase,
    handleDeleteUrl: hookHandlers.handleDeleteUrl,
    handleReorderUrls: hookHandlers.handleReorderUrls,
    handleSetUrlCategory: hookHandlers.handleSetUrlCategory,
    handleUpdateCategoryOrder: hookHandlers.handleUpdateCategoryOrder,
    project,
  })

  const [isManagementModalOpen, setIsManagementModalOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('default')
  const [userCollapsedState, setUserCollapsedState] = useState(false)

  const handleOpenManagement = useCallback(() => {
    setIsManagementModalOpen(true)
  }, [])

  const handleCloseManagement = useCallback(() => {
    setIsManagementModalOpen(false)
  }, [])

  const { urls, dnd, categoryOrder } = hookState
  const sortedProjectUrls = useMemo(
    () => sortProjectUrls(urls.projectUrls, sortOrder),
    [urls.projectUrls, sortOrder],
  )
  const sortedUncategorizedUrls = useMemo(
    () => sortedProjectUrls.filter((url) => !url.category),
    [sortedProjectUrls],
  )

  // プロジェクト全体をドラッグ可能にするためのsortable設定
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    data: {
      name: project.name,
      projectId: project.id,
      type: 'project',
    },
    id: project.id,
  })

  const DRAGGING_OPACITY = 0.5

  const style: CSSProperties = useMemo(
    () => ({
      containIntrinsicSize: '360px',
      contentVisibility: 'auto',
      opacity: isDragging ? DRAGGING_OPACITY : 1,
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [isDragging, transform, transition],
  )

  // このプロジェクトをドロップターゲットとして設定
  const { setNodeRef: setProjectDroppableRef, isOver: isProjectOver } =
    useDroppable({
      data: {
        projectId: project.id,
        type: 'project',
      },
      id: `project-${project.id}`,
    })

  const {
    setNodeRef: setProjectHeaderDroppableRef,
    isOver: isProjectHeaderOver,
  } = useDroppable({
    data: {
      projectId: project.id,
      type: 'project-header',
    },
    id: `project-header-${project.id}`,
  })

  // 未分類URLエリア用のドロップ領域
  const { setNodeRef: setUncategorizedDropRef, isOver: isUncategorizedOver } =
    useDroppable({
      data: {
        isDropArea: true,
        projectId: project.id,
        type: 'uncategorized',
      },
      id: `uncategorized-${project.id}`,
    })

  // 両方のrefを組み合わせる
  const setCombinedRefs = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node)
      setProjectDroppableRef(node)
    },
    [setNodeRef, setProjectDroppableRef],
  )

  // ドラッグハンドラの登録
  const { registerHandlers, unregisterHandlers } = useDragHandlers()

  useEffect(() => {
    registerHandlers(project.id, {
      clearDragState: dnd.resetDnD,
      handleCategoryDragEnd: dnd.handleCategoryDragEnd,
      handleDragOver: dnd.handleDragOver,
      handleDragStart: dnd.handleDragStart,
      handleUrlDragEnd: dnd.handleUrlDragEnd,
    })
    return () => {
      unregisterHandlers(project.id)
    }
  }, [project.id, registerHandlers, unregisterHandlers, dnd])

  // 別プロジェクトからドラッグされているかを判定
  const isExternalItemOver =
    !isProjectReorderMode &&
    (isProjectOver || isProjectHeaderOver || isDropTarget)
  const isCollapsed =
    isProjectReorderMode || isCrossProjectUrlDragActive || userCollapsedState

  const projectUrlCount =
    project.urlIds?.length ?? project.urls?.length ?? sortedProjectUrls.length

  const handleOpenAllUrls = useCallback(() => {
    if (projectUrlCount === 0) {
      return
    }
    handlers.handleOpenAllUrls?.(
      sortedProjectUrls.map((u) => ({
        title: u.title || '',
        url: u.url,
      })),
    )
  }, [handlers, projectUrlCount, sortedProjectUrls])

  const handleDeleteAllUrls = useCallback(() => {
    if (projectUrlCount === 0) {
      return
    }
    if (handlers.handleDeleteUrlsFromProject) {
      handlers.handleDeleteUrlsFromProject(
        project.id,
        sortedProjectUrls.map((u) => u.url),
      )
    } else {
      // プロジェクト内のすべてのURLを削除
      for (const urlItem of sortedProjectUrls) {
        hookHandlers.handleDeleteUrl(project.id, urlItem.url)
      }
    }
  }, [handlers, hookHandlers, project.id, projectUrlCount, sortedProjectUrls])

  const contextValue: ProjectCardContextType = useMemo(
    () => ({
      categoryOrder,
      handlers,
      hookState: {
        ...hookState,
        urls: {
          ...hookState.urls,
          projectUrls: sortedProjectUrls,
          uncategorizedUrls: sortedUncategorizedUrls,
        },
      },
      isExternalItemOver,
      isUncategorizedOver,
      project,
      setUncategorizedDropRef,
      settings,
    }),
    [
      hookState,
      project,
      settings,
      isUncategorizedOver,
      isExternalItemOver,
      setUncategorizedDropRef,
      categoryOrder,
      handlers,
      sortedProjectUrls,
      sortedUncategorizedUrls,
    ],
  )

  const titleBadges = useMemo(
    () => <Badge variant='secondary'>{projectUrlCount}</Badge>,
    [projectUrlCount],
  )

  return (
    <ProjectCardContext value={contextValue}>
      <Card
        className={`mb-4 w-full overflow-x-hidden ${
          isExternalItemOver
            ? 'border-2 border-primary bg-primary/5 shadow-lg'
            : ''
        }`}
        data-saved-tabs-scroll-target='project'
        ref={setCombinedRefs}
        style={style}
      >
        <CardHeader
          className='sticky top-0 z-50 my-2 flex-row items-baseline justify-between bg-card px-3 text-foreground'
          ref={setProjectHeaderDroppableRef}
        >
          <div className='flex grow items-center gap-2'>
            <CardCollapseControl
              isCollapsed={isCollapsed}
              setIsCollapsed={setUserCollapsedState}
              setUserCollapsedState={setUserCollapsedState}
              isDisabled={isProjectReorderMode}
            />
            <CardSortControl
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
            />
            <CardGroupTitle
              title={project.name}
              badges={titleBadges}
              sortableAttributes={attributes}
              sortableListeners={listeners}
              className='py-2'
            />
          </div>
          <CardGroupActions
            onOpenAll={projectUrlCount > 0 ? handleOpenAllUrls : undefined}
            onDeleteAll={projectUrlCount > 0 ? handleDeleteAllUrls : undefined}
            onManage={handleOpenManagement}
            onConfirmOpenAll={projectUrlCount >= BULK_OPEN_THRESHOLD}
            // eslint-disable-next-line react/jsx-handler-names -- boolean toggle prop for CardGroupActions
            onConfirmDeleteAll={settings.confirmDeleteAll}
            openAllThreshold={10}
            itemName={t('savedTabs.project.deleteAllItemName')}
            warningMessage={t('savedTabs.project.deleteAllWarning')}
          />
        </CardHeader>
        <CardContent className='overflow-x-hidden'>
          {!isCollapsed && (
            <>
              {children}

              {/* ローディング状態 */}
              {urls.isLoadingUrls && (
                <div className='flex justify-center py-4 text-muted-foreground'>
                  <Spinner className='size-5' />
                </div>
              )}

              {/* プロジェクトが空の場合 */}
              {urls.projectUrls.length === 0 &&
                !isExternalItemOver &&
                !urls.isLoadingUrls && (
                  <div
                    className='py-4 text-center text-muted-foreground'
                    data-testid='project-empty-state'
                  >
                    {t('savedTabs.project.emptyTitle')}
                    <br />
                    {t('savedTabs.project.emptyDescription')}
                    <br />
                    {t('savedTabs.project.emptyDragHint')}
                  </div>
                )}
            </>
          )}
        </CardContent>
      </Card>
      <ProjectManagementModal
        isOpen={isManagementModalOpen}
        onClose={handleCloseManagement}
        project={project}
        onRenameProject={handlers.handleRenameProject}
        onUpdateProjectKeywords={handlers.handleUpdateProjectKeywords}
        onDeleteProject={handlers.handleDeleteProject}
      />
    </ProjectCardContext>
  )
}
