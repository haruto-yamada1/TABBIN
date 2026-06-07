/* eslint-disable typescript/require-await */
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { memo, useMemo, useReducer, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import type { SortOrder } from '../hooks/useSortOrder'
import type { CustomProjectCategoryProps } from '../types/CustomProjectCategory.types'
import { CustomProjectCategoryBulkConfirmDialogs } from './CustomProjectCategoryBulkConfirmDialogs'
import { CustomProjectCategoryHeaderActions } from './CustomProjectCategoryHeaderActions'
import { CustomProjectCategoryManageDialog } from './CustomProjectCategoryManageDialog'
import { ProjectUrlItem } from './ProjectUrlItem'
import { CardCollapseControl } from './shared/CardCollapseControl'
import { CardSortControl } from './shared/CardSortControl'

type CategoryUrl = NonNullable<CustomProjectCategoryProps['urls']>[number]

// eslint-disable-next-line eslint/no-magic-numbers
const shouldConfirmBulkOpen = (urlCount: number): boolean => urlCount >= 10

const sortCategoryUrls = (
  categoryUrls: CategoryUrl[],
  sortOrder: SortOrder,
): CategoryUrl[] => {
  if (sortOrder === 'default') {
    return categoryUrls
  }

  const sorted = [...categoryUrls]
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  sorted.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0))
  if (sortOrder === 'desc') {
    sorted.reverse()
  }
  return sorted
}

const getReorderStyle = (isReorderTarget: boolean): React.CSSProperties => {
  if (!isReorderTarget) {
    return {}
  }
  return {
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    borderColor: 'rgb(59, 130, 246)',
    borderWidth: '2px',
  }
}

interface CategoryHeaderMainProps {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
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
  category,
  isCollapsed,
  isCollapseDisabled,
  sortOrder,
  urlCount,
  setIsCollapsed,
  setUserCollapsedState,
  setSortOrder,
}: CategoryHeaderMainProps) => (
  <div
    {...attributes}
    {...listeners}
    className='flex grow cursor-grab items-center gap-2 overflow-hidden hover:cursor-grab active:cursor-grabbing'
  >
    <CardCollapseControl
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
      setUserCollapsedState={setUserCollapsedState}
      isDisabled={isCollapseDisabled}
      // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
    />
    <CardSortControl
      sortOrder={sortOrder}
      setSortOrder={setSortOrder}
      // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
    />

    <div className='shrink-0 text-muted-foreground'>
      <GripVertical size={16} aria-hidden='true' />
    </div>
    <h3 className='m-0 border-none bg-transparent p-0 text-lg font-medium'>
      {category}
    </h3>
    <Badge variant='secondary'>{urlCount}</Badge>
  </div>
)

interface CategoryContentProps {
  urls: CategoryUrl[]
  isOver: boolean
  category: string
  projectId: string
  categoryDropId: string
  setDroppableRef: (node: HTMLElement | null) => void
  handleOpenUrl: (url: string) => void
  handleDeleteUrl: (projectId: string, url: string) => void
  handleSetUrlCategory: (
    projectId: string,
    url: string,
    category?: string,
  ) => void
  settings: CustomProjectCategoryProps['settings']
}

const renderCategoryContent = ({
  urls,
  isOver,
  category,
  projectId,
  categoryDropId,
  setDroppableRef,
  handleOpenUrl,
  handleDeleteUrl,
  handleSetUrlCategory,
  settings,
}: CategoryContentProps) => (
  <CardContent
    ref={setDroppableRef}
    className='p-2'
    data-is-drop-area='true'
    data-category-name={category}
    data-project-id={projectId}
    data-is-category='true'
    data-type='category'
    data-category-drop-id={categoryDropId}
  >
    {urls.length > 0 ? (
      <SortableContext
        // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
        items={urls.map((item) => item.url)}
        strategy={verticalListSortingStrategy}
      >
        <ul className={`gap-y-1 ${isOver ? 'rounded bg-primary/5 p-1' : ''}`}>
          {urls.map((item) => (
            <ProjectUrlItem
              key={item.url}
              item={item}
              projectId={projectId}
              handleOpenUrl={handleOpenUrl}
              handleDeleteUrl={handleDeleteUrl}
              handleSetCategory={handleSetUrlCategory}
              // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
              availableCategories={['undefined']}
              settings={settings}
            />
          ))}
        </ul>
      </SortableContext>
    ) : (
      <div
        className={`rounded border-2 border-dashed p-4 py-2 text-center text-muted-foreground ${
          isOver ? 'border-primary bg-primary/10' : ''
        }`}
      />
    )}
  </CardContent>
)

// eslint-disable-next-line eslint/complexity
const useCustomProjectCategoryView = ({ // eslint-disable-line eslint/max-lines-per-function
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
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      data: {
        ...dragData,
        categoryName: category,
        isCategory: true,
        projectId,
      },
      id: category,
    })

  const categoryDropId = `category-drop-${projectId}-${category}`
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    data: {
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
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    () => sortCategoryUrls(urls || [], sortOrder),
    [urls, sortOrder],
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

  const isDropTarget = isHighlighted || isOver
  const isSelfDragging = isDraggingCategory && draggedCategoryName === category
  const isReorderTarget =
    isDraggingCategory &&
    draggedCategoryName !== null &&
    draggedCategoryName !== category &&
    isDropTarget
  const isCollapsed =
    isDraggingCategory || isCategoryReorder || userCollapsedState

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
  const cardStyle = {
    ...style,
    ...(isOver
      ? {
          backgroundColor: 'rgba(0, 255, 0, 0.05)',
        }
      : {}),
    ...getReorderStyle(isReorderTarget),
  }
  const cardClassName = `mb-2 overflow-x-hidden ${
    isDropTarget ? 'border-2 border-primary bg-primary/5' : ''
  } ${isSelfDragging ? 'opacity-50' : ''}`
  const categoryDisplayName =
    category === '__uncategorized' ? t('savedTabs.uncategorized') : category
  const showManageActions = Boolean(
    // eslint-disable-next-line typescript/prefer-nullish-coalescing
    handleRenameCategory || handleDeleteCategory,
  )
  const showBulkActions = sortedCategoryUrls.length > 0
  const isCollapseDisabled = isDraggingCategory || isCategoryReorder

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleOpenAllUrlsConfirmed = () => {
    if (handleOpenAllUrls) {
      handleOpenAllUrls(sortedCategoryUrls)
      return
    }
    for (const item of sortedCategoryUrls) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDeleteAllUrlsConfirmed = async () => {
    // eslint-disable-line typescript/require-await
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
  }

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleOpenAllClick = () => {
    if (shouldConfirmBulkOpen(sortedCategoryUrls.length)) {
      setIsOpenAllConfirmOpen(true)
      return
    }
    handleOpenAllUrlsConfirmed()
  }

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDeleteAllClick = () => {
    if (settings.confirmDeleteAll) {
      setIsDeleteAllConfirmOpen(true)
      return
    }
    void handleDeleteAllUrlsConfirmed()
  }

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleRename = () => {
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
  }

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleConfirmDelete = () => {
    if (handleDeleteCategory) {
      handleDeleteCategory(projectId, category)
    }
    setShowManageDialog(false)
  }

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleOpenManageDialog = () => {
    setNewCategoryName(category)
    setRenameError(null)
    setShowDeleteConfirm(false)
    setShowManageDialog(true)
  }

  return (
    <>
      <Card
        ref={setNodeRef}
        style={cardStyle}
        className={cardClassName}
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

        {!isCollapsed &&
          renderCategoryContent({
            urls: sortedCategoryUrls,
            isOver,
            category,
            projectId,
            categoryDropId,
            setDroppableRef,
            handleOpenUrl,
            handleDeleteUrl,
            handleSetUrlCategory,
            settings,
          })}

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
