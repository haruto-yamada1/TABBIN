import { useCallback, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { GetProjectUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase'
import { CardCollapseControl } from '@/contexts/saved-tabs/presentation/components/shared/CardCollapseControl'
import { CardGroupActions } from '@/contexts/saved-tabs/presentation/components/shared/CardGroupActions'
import { CardGroupTitle } from '@/contexts/saved-tabs/presentation/components/shared/CardGroupTitle'
import { CardSortControl } from '@/contexts/saved-tabs/presentation/components/shared/CardSortControl'
import { useCustomProjectCard } from '@/contexts/saved-tabs/presentation/hooks/useCustomProjectCard'
import type { SortOrder } from '@/contexts/saved-tabs/presentation/hooks/useSortOrder'
import type { CustomProjectCardProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectCard.types'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { ProjectCardBody } from './ProjectCardBody'
import { ProjectCardContext } from './ProjectCardContext'
import type { ProjectCardContextType } from './ProjectCardContext'
import { ProjectManagementModal } from './ProjectManagementModal'
import { useProjectCardDragDrop } from './useProjectCardDragDrop'

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
type ProjectCardRootProps = {
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

const getProjectUrlCount = (
  project: ProjectCardRootProps['project'],
  loadedUrlCount: number,
) => project.urls?.length ?? project.memberships?.length ?? loadedUrlCount

const ProjectCardManagementModal = ({
  isOpen,
  onClose,
  project,
  handlers,
}: {
  isOpen: boolean
  onClose: () => void
  project: ProjectCardRootProps['project']
  handlers: ProjectCardRootProps['handlers']
}) => (
  <ProjectManagementModal
    isOpen={isOpen}
    onClose={onClose}
    project={project}
    {...(handlers.handleRenameProject !== undefined
      ? { onRenameProject: handlers.handleRenameProject }
      : {})}
    {...(handlers.handleUpdateProjectKeywords !== undefined
      ? { onUpdateProjectKeywords: handlers.handleUpdateProjectKeywords }
      : {})}
    {...(handlers.handleDeleteProject !== undefined
      ? { onDeleteProject: handlers.handleDeleteProject }
      : {})}
  />
)

/**
 * ProjectCard の複合コンポーネントルート
 * Card + useSortable + useDroppable + useCustomProjectCard + DndContext を提供する
 * @param props ProjectCardRootProps
 */
export const ProjectCardRoot = ({
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
    ...(getProjectUrlsUseCase !== undefined ? { getProjectUrlsUseCase } : {}),
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

  const {
    attributes,
    listeners,
    style,
    setCombinedRefs,
    setProjectHeaderDroppableRef,
    setUncategorizedDropRef,
    isUncategorizedOver,
    isProjectOver,
    isProjectHeaderOver,
  } = useProjectCardDragDrop(project, dnd)

  // 別プロジェクトからドラッグされているかを判定
  const isExternalItemOver =
    !isProjectReorderMode &&
    (isProjectOver || isProjectHeaderOver || isDropTarget)
  const isCollapsed =
    isProjectReorderMode || isCrossProjectUrlDragActive || userCollapsedState

  const projectUrlCount = getProjectUrlCount(project, sortedProjectUrls.length)

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
            {...(projectUrlCount > 0
              ? {
                  onOpenAll: handleOpenAllUrls,
                  onDeleteAll: handleDeleteAllUrls,
                }
              : {})}
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
            <ProjectCardBody
              isLoading={urls.isLoadingUrls}
              isEmpty={urls.projectUrls.length === 0}
              isExternalItemOver={isExternalItemOver}
            >
              {children}
            </ProjectCardBody>
          )}
        </CardContent>
      </Card>
      <ProjectCardManagementModal
        isOpen={isManagementModalOpen}
        onClose={handleCloseManagement}
        project={project}
        handlers={handlers}
      />
    </ProjectCardContext>
  )
}
