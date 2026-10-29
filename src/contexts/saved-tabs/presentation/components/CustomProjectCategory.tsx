import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { memo, useCallback, useMemo, useReducer, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useDropTargetFeedback } from '@/contexts/saved-tabs/presentation/hooks/useDropTargetFeedback'
import type { SortOrder } from '@/contexts/saved-tabs/presentation/hooks/useSortOrder'
import {
  getProjectCategorySortableId,
  getProjectUrlSortableId,
} from '@/contexts/saved-tabs/presentation/lib/custom-project-dnd'
import { getFavoriteDisplayUrls } from '@/contexts/saved-tabs/presentation/lib/favorite-display'
import type { CustomProjectCategoryProps } from '@/contexts/saved-tabs/presentation/types/CustomProjectCategory.types'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { CustomProjectCategoryBulkConfirmDialogs } from './CustomProjectCategoryBulkConfirmDialogs'
import { CustomProjectCategoryHeaderActions } from './CustomProjectCategoryHeaderActions'
import { CustomProjectCategoryManageDialog } from './CustomProjectCategoryManageDialog'
import { ProjectUrlItem } from './ProjectUrlItem'
import { CardCollapseControl } from './shared/CardCollapseControl'
import { CardSortControl } from './shared/CardSortControl'

type CategoryUrl = NonNullable<CustomProjectCategoryProps['urls']>[number]

const BULK_OPEN_THRESHOLD = 10
const shouldConfirmBulkOpen = (urlCount: number): boolean =>
  urlCount >= BULK_OPEN_THRESHOLD

const sortCategoryUrls = (
  categoryUrls: CategoryUrl[],
  sortOrder: SortOrder,
): CategoryUrl[] => {
  if (sortOrder === 'default') {
    return getFavoriteDisplayUrls(categoryUrls)
  }

  const sorted = [...categoryUrls]
  sorted.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0))
  if (sortOrder === 'desc') {
    sorted.reverse()
  }
  return getFavoriteDisplayUrls(sorted)
}

type CategoryHeaderMainProps = {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setActivatorNodeRef: ReturnType<typeof useSortable>['setActivatorNodeRef']
  category: string
  isCollapsed: boolean
  isCollapseDisabled: boolean
  sortOrder: SortOrder
  urlCount: number
  setIsCollapsed: (value: boolean) => void
  setUserCollapsedState: (value: boolean) => void
  setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>
}

const CategoryHeaderMain = ({
  attributes,
  listeners,
  setActivatorNodeRef,
  category,
  isCollapsed,
  isCollapseDisabled,
  sortOrder,
  urlCount,
  setIsCollapsed,
  setUserCollapsedState,
  setSortOrder,
}: CategoryHeaderMainProps) => {
  const { t } = useI18n()
  const handleCollapsePointerDown = useCallback((event: React.PointerEvent) => {
    event.stopPropagation()
  }, [])

  const handleSortPointerDown = useCallback((event: React.PointerEvent) => {
    event.stopPropagation()
  }, [])

  return (
    <div className='flex grow items-center gap-2 overflow-hidden'>
      <CardCollapseControl
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        setUserCollapsedState={setUserCollapsedState}
        isDisabled={isCollapseDisabled}
        onPointerDown={handleCollapsePointerDown}
      />
      <CardSortControl
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        onPointerDown={handleSortPointerDown}
      />

      <button
        type='button'
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t('savedTabs.category.dragHandleAria', undefined, {
          name: category,
        })}
        className='shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing'
      >
        <GripVertical size={16} aria-hidden='true' />
      </button>
      <h3 className='m-0 border-none bg-transparent p-0 text-lg font-medium'>
        {category}
      </h3>
      <Badge variant='secondary'>{urlCount}</Badge>
    </div>
  )
}

const CATEGORY_SELECT_OPTIONS: string[] = ['undefined']

type CategoryContentProps = {
  urls: CategoryUrl[]
  urlIds: string[]
  isOver: boolean
  category: string
  projectId: string
  categoryDropId: string
  setDroppableRef: (node: HTMLElement | null) => void
  onOpenUrl: (url: string) => void
  onDeleteUrl: (projectId: string, url: string) => void
  onSetUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => void | Promise<void>
  settings: CustomProjectCategoryProps['settings']
}

const CategoryContent = (props: CategoryContentProps) => {
  const projectUrlItemProps = {
    handleOpenUrl: props.onOpenUrl,
    handleDeleteUrl: props.onDeleteUrl,
    handleSetCategory: props.onSetUrlCategory,
  }

  return (
    <CardContent
      ref={props.setDroppableRef}
      className='p-2'
      data-is-drop-area='true'
      data-category-name={props.category}
      data-project-id={props.projectId}
      data-is-category='true'
      data-type='category'
      data-category-drop-id={props.categoryDropId}
    >
      {props.urls.length > 0 ? (
        <SortableContext
          items={props.urlIds}
          strategy={verticalListSortingStrategy}
        >
          <ul
            className={`gap-y-1 ${props.isOver ? 'rounded bg-primary/5' : ''}`}
            data-testid='category-url-list'
          >
            {props.urls.map((item) => (
              <ProjectUrlItem
                item={item}
                projectId={props.projectId}
                {...projectUrlItemProps}
                key={item.url}
                availableCategories={CATEGORY_SELECT_OPTIONS}
                settings={props.settings}
              />
            ))}
          </ul>
        </SortableContext>
      ) : (
        <div
          className={`rounded border-2 border-dashed p-4 py-2 text-center text-muted-foreground ${
            props.isOver ? 'border-primary bg-primary/10' : ''
          }`}
          data-testid='empty-state'
        />
      )}
    </CardContent>
  )
}

// eslint-disable-next-line eslint/complexity
const useCustomProjectCategoryView = ({
  // eslint-disable-line eslint/max-lines-per-function
  projectId,
  category,
  urls,
  handleOpenUrl,
  handleDeleteUrl,
  handleDeleteUrlsFromProject,
  handleDeleteCategory,
  handleSetUrlCategory,
  settings,
  handleOpenAllUrls,
  dragData = { type: 'category' },
  isHighlighted = false,
  isDraggingCategory = false,
  draggedCategoryName = null,
  isCategoryReorder = false,
  handleRenameCategory,
}: CustomProjectCategoryProps) => {
  const { t } = useI18n()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({
    data: {
      ...dragData,
      categoryName: category,
      name: category,
      isCategory: true,
      projectId,
    },
    id: getProjectCategorySortableId(projectId, category),
  })

  const categoryDropId = `category-drop-${projectId}-${category}`
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    data: {
      name: category,
      categoryName: category,
      isCategory: true,
      isDropArea: true,
      projectId,
      type: 'category',
    },
    id: categoryDropId,
  })

  const [sortOrder, setSortOrder] = useState<SortOrder>('default')
  const sortedCategoryUrls = useMemo(
    () => sortCategoryUrls(urls ?? [], sortOrder),
    [urls, sortOrder],
  )
  const sortedCategoryUrlIds = useMemo(
    () =>
      sortedCategoryUrls.map((item) =>
        getProjectUrlSortableId(projectId, item.url),
      ),
    [projectId, sortedCategoryUrls],
  )
  const [userCollapsedState, setUserCollapsedState] = useState(false)
  const [showManageDialog, setShowManageDialog] = useState(false)
  const [newCategoryName, setNewCategoryName] = useReducer(
    (_state: string, nextCategoryName: string) => nextCategoryName,
    category,
  )
  const [renameError, setRenameError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)

  const feedback = useDropTargetFeedback({
    id: getProjectCategorySortableId(projectId, category),
    accepts: 'custom',
    isOver: isHighlighted || isOver,
  })
  const isSelfDragging = isDraggingCategory && draggedCategoryName === category
  const isCollapsed =
    isDraggingCategory || isCategoryReorder || userCollapsedState

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  )
  const cardClassName = `mb-2 overflow-x-hidden ${feedback.className} ${isSelfDragging ? 'opacity-50' : ''}`
  const categoryDisplayName =
    category === '__uncategorized' ? t('savedTabs.uncategorized') : category
  const showManageActions = Boolean(
    // `||` needed: either callback could be falsey/undefined; both are independent conditions
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    handleRenameCategory || handleDeleteCategory,
  )
  const showBulkActions = sortedCategoryUrls.length > 0
  const isCollapseDisabled = isDraggingCategory || isCategoryReorder

  const handleOpenAllUrlsConfirmed = useCallback(() => {
    if (handleOpenAllUrls) {
      handleOpenAllUrls(sortedCategoryUrls)
      return
    }
    for (const item of sortedCategoryUrls) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }, [handleOpenAllUrls, sortedCategoryUrls])

  const handleDeleteAllUrlsConfirmed = useCallback(() => {
    if (handleDeleteUrlsFromProject) {
      handleDeleteUrlsFromProject(
        projectId,
        sortedCategoryUrls.map((item) => item.url),
      )
    } else {
      sortedCategoryUrls.forEach((item) => {
        handleDeleteUrl(projectId, item.url)
      })
    }
  }, [
    handleDeleteUrlsFromProject,
    handleDeleteUrl,
    projectId,
    sortedCategoryUrls,
  ])

  const handleOpenAllClick = useCallback(() => {
    if (shouldConfirmBulkOpen(sortedCategoryUrls.length)) {
      setIsOpenAllConfirmOpen(true)
      return
    }
    handleOpenAllUrlsConfirmed()
  }, [sortedCategoryUrls.length, handleOpenAllUrlsConfirmed])

  const handleDeleteAllClick = useCallback(() => {
    if (settings.confirmDeleteAll) {
      setIsDeleteAllConfirmOpen(true)
      return
    }
    handleDeleteAllUrlsConfirmed()
  }, [settings.confirmDeleteAll, handleDeleteAllUrlsConfirmed])

  const handleRename = useCallback(() => {
    if (!newCategoryName.trim()) {
      setRenameError(t('savedTabs.projectCategory.required'))
      return
    }
    if (newCategoryName === category) {
      return
    }
    if (handleRenameCategory) {
      handleRenameCategory(projectId, category, newCategoryName)
    }
  }, [
    newCategoryName,
    category,
    handleRenameCategory,
    projectId,
    t,
    setRenameError,
  ])

  const handleConfirmDelete = useCallback(() => {
    if (handleDeleteCategory) {
      handleDeleteCategory(projectId, category)
    }
    setShowManageDialog(false)
  }, [handleDeleteCategory, projectId, category, setShowManageDialog])

  const handleOpenManageDialog = useCallback(() => {
    setNewCategoryName(category)
    setRenameError(null)
    setShowDeleteConfirm(false)
    setShowManageDialog(true)
  }, [
    category,
    setNewCategoryName,
    setRenameError,
    setShowDeleteConfirm,
    setShowManageDialog,
  ])

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        className={cardClassName}
        data-drop-state={feedback.state}
        id={categoryDropId}
        data-category={category}
        data-is-drop-target='true'
        data-project-id={projectId}
        data-category-name={category}
        data-is-category='true'
        data-type='category'
        data-category-drop-id={categoryDropId}
        aria-label={t('savedTabs.categoryCardAria', undefined, {
          name: category,
        })}
      >
        <CardHeader className='flex-row items-center justify-between px-3 py-2'>
          <CategoryHeaderMain
            attributes={attributes}
            listeners={listeners}
            setActivatorNodeRef={setActivatorNodeRef}
            category={category}
            isCollapsed={isCollapsed}
            isCollapseDisabled={isCollapseDisabled}
            sortOrder={sortOrder}
            urlCount={sortedCategoryUrls.length}
            setIsCollapsed={setUserCollapsedState}
            setUserCollapsedState={setUserCollapsedState}
            setSortOrder={setSortOrder}
          />
          <CustomProjectCategoryHeaderActions
            showManageActions={showManageActions}
            showBulkActions={showBulkActions}
            onOpenManageDialog={handleOpenManageDialog}
            onOpenAllClick={handleOpenAllClick}
            onDeleteAllClick={handleDeleteAllClick}
          />
        </CardHeader>

        {!isCollapsed && (
          <CategoryContent
            urls={sortedCategoryUrls}
            urlIds={sortedCategoryUrlIds}
            isOver={feedback.state === 'over'}
            category={category}
            projectId={projectId}
            categoryDropId={categoryDropId}
            setDroppableRef={setDroppableRef}
            onOpenUrl={handleOpenUrl}
            onDeleteUrl={handleDeleteUrl}
            onSetUrlCategory={handleSetUrlCategory}
            settings={settings}
          />
        )}

        <CustomProjectCategoryManageDialog
          category={category}
          showManageDialog={showManageDialog}
          setShowManageDialog={setShowManageDialog}
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          renameError={renameError}
          showDeleteConfirm={showDeleteConfirm}
          setShowDeleteConfirm={setShowDeleteConfirm}
          onRename={handleRename}
          onConfirmDelete={handleConfirmDelete}
        />
      </Card>

      <CustomProjectCategoryBulkConfirmDialogs
        isOpenAllConfirmOpen={isOpenAllConfirmOpen}
        setIsOpenAllConfirmOpen={setIsOpenAllConfirmOpen}
        isDeleteAllConfirmOpen={isDeleteAllConfirmOpen}
        setIsDeleteAllConfirmOpen={setIsDeleteAllConfirmOpen}
        categoryDisplayName={categoryDisplayName}
        onConfirmOpenAll={handleOpenAllUrlsConfirmed}
        onConfirmDeleteAll={handleDeleteAllUrlsConfirmed}
      />
    </>
  )
}

const CustomProjectCategoryComponent = (props: CustomProjectCategoryProps) =>
  useCustomProjectCategoryView(props)

const CustomProjectCategory = memo(CustomProjectCategoryComponent)
CustomProjectCategory.displayName = 'CustomProjectCategory'

export { CustomProjectCategory }
