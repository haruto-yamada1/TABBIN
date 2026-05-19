import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ExternalLink, GripVertical, Settings, Trash2 } from 'lucide-react'
import { memo, useMemo, useReducer, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import type { SortOrder } from '../hooks/useSortOrder'
import type { CustomProjectCategoryProps } from '../types/CustomProjectCategory.types'
import { ProjectUrlItem } from './ProjectUrlItem'
import { CardCollapseControl } from './shared/CardCollapseControl'
import { CardSortControl } from './shared/CardSortControl'
import { OpenAllTabsConfirmDialog } from './shared/OpenAllTabsConfirmDialog'
import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './shared/SavedTabsResponsive'

type CategoryUrl = NonNullable<CustomProjectCategoryProps['urls']>[number]

const shouldConfirmBulkOpen = (urlCount: number): boolean => urlCount >= 10

const shouldStopDialogPropagation = (key: string): boolean =>
  key === 'Enter' || key === ' '

const sortCategoryUrls = (
  categoryUrls: CategoryUrl[],
  sortOrder: SortOrder,
): CategoryUrl[] => {
  if (sortOrder === 'default') {
    return categoryUrls
  }

  const sorted = [...categoryUrls]
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
      onPointerDown={(event) => event.stopPropagation()}
    />
    <CardSortControl
      sortOrder={sortOrder}
      setSortOrder={setSortOrder}
      onPointerDown={(event) => event.stopPropagation()}
    />

    <div className='shrink-0 text-muted-foreground'>
      <GripVertical size={16} aria-hidden='true' />
    </div>
    <h3 className='m-0 border-none bg-transparent p-0 font-medium text-lg'>
      {category}
    </h3>
    <Badge variant='secondary'>{urlCount}</Badge>
  </div>
)

interface CategoryHeaderActionsProps {
  showManageActions: boolean
  showBulkActions: boolean
  onOpenManageDialog: () => void
  onOpenAllClick: () => void
  onDeleteAllClick: () => void
}

const CategoryHeaderActions = ({
  showManageActions,
  showBulkActions,
  onOpenManageDialog,
  onOpenAllClick,
  onDeleteAllClick,
}: CategoryHeaderActionsProps) => {
  const { t } = useI18n()

  return (
    <div className='flex items-center gap-1'>
      {showManageActions && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant='secondary'
              size='sm'
              className='flex cursor-pointer items-center gap-1'
              onClick={onOpenManageDialog}
              aria-label={t('savedTabs.projectCategory.manage')}
            >
              <Settings size={14} />
              <SavedTabsResponsiveLabel>
                {t('savedTabs.projectCategory.manage')}
              </SavedTabsResponsiveLabel>
            </Button>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            {t('savedTabs.projectCategory.manage')}
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>
      )}

      {showBulkActions && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                className='flex cursor-pointer items-center gap-1'
                onClick={onOpenAllClick}
                aria-label={t('savedTabs.openAll')}
              >
                <ExternalLink size={14} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.openAll')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {t('savedTabs.openAll')}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                className='flex cursor-pointer items-center gap-1'
                onClick={onDeleteAllClick}
                aria-label={t('savedTabs.deleteAll')}
              >
                <Trash2 size={14} />
                <SavedTabsResponsiveLabel>
                  {t('savedTabs.deleteAll')}
                </SavedTabsResponsiveLabel>
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {t('savedTabs.deleteAll')}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  )
}

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

const CategoryContent = ({
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

interface CategoryManageDialogProps {
  category: string
  showManageDialog: boolean
  setShowManageDialog: (open: boolean) => void
  newCategoryName: string
  setNewCategoryName: (name: string) => void
  renameError: string | null
  showDeleteConfirm: boolean
  setShowDeleteConfirm: (show: boolean) => void
  onRename: () => void
  onConfirmDelete: () => void
}

const CategoryManageDialog = ({
  category,
  showManageDialog,
  setShowManageDialog,
  newCategoryName,
  setNewCategoryName,
  renameError,
  showDeleteConfirm,
  setShowDeleteConfirm,
  onRename,
  onConfirmDelete,
}: CategoryManageDialogProps) => {
  const { t } = useI18n()
  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    if (shouldStopDialogPropagation(event.key)) {
      event.stopPropagation()
    }
  }

  const handleRenameInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    onRename()
  }

  return (
    <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
      <DialogContent
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{t('savedTabs.projectCategory.title')}</DialogTitle>
          <DialogDescription>
            {t('savedTabs.projectCategory.renameDescription', undefined, {
              name: category,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='gap-y-4'>
          <div>
            <Label htmlFor='rename-input'>
              {t('savedTabs.projectCategory.renameLabel')}
            </Label>
            <Input
              id='rename-input'
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onBlur={onRename}
              placeholder={t('savedTabs.projectCategory.renamePlaceholder')}
              className={`w-full rounded border p-2 ${renameError ? 'border-red-500' : ''}`}
              onKeyDown={handleRenameInputKeyDown}
            />
            {renameError && (
              <p className='mt-1 text-red-500 text-xs'>{renameError}</p>
            )}
          </div>

          <div className='border-t pt-4'>
            <p className='text-sm text-zinc-600'>
              {t('savedTabs.projectCategory.deleteWarning')}
            </p>
            {showDeleteConfirm ? (
              <div className='mt-2 flex justify-end gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant='destructive'
                  size='sm'
                  onClick={onConfirmDelete}
                >
                  {t('common.delete')}
                </Button>
              </div>
            ) : (
              <div className='mt-2 flex justify-end'>
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  {t('savedTabs.projectCategory.deleteAction')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface CategoryBulkConfirmDialogsProps {
  isOpenAllConfirmOpen: boolean
  setIsOpenAllConfirmOpen: (open: boolean) => void
  isDeleteAllConfirmOpen: boolean
  setIsDeleteAllConfirmOpen: (open: boolean) => void
  categoryDisplayName: string
  onConfirmOpenAll: () => void
  onConfirmDeleteAll: () => Promise<void>
}

const CategoryBulkConfirmDialogs = ({
  isOpenAllConfirmOpen,
  setIsOpenAllConfirmOpen,
  isDeleteAllConfirmOpen,
  setIsDeleteAllConfirmOpen,
  categoryDisplayName,
  onConfirmOpenAll,
  onConfirmDeleteAll,
}: CategoryBulkConfirmDialogsProps) => {
  const { t } = useI18n()

  return (
    <>
      <OpenAllTabsConfirmDialog
        open={isOpenAllConfirmOpen}
        onOpenChange={setIsOpenAllConfirmOpen}
        title={t('savedTabs.openAllConfirmTitle')}
        description={t('savedTabs.openAllConfirmDescription', undefined, {
          count: '10',
        })}
        cancelLabel={t('common.cancel')}
        openLabel={t('common.open')}
        onConfirm={onConfirmOpenAll}
      />

      <AlertDialog
        open={isDeleteAllConfirmOpen}
        onOpenChange={setIsDeleteAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.deleteAllConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.projectCategory.deleteAllWarning', undefined, {
                categoryName: categoryDisplayName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void onConfirmDeleteAll()}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const useCustomProjectCategoryView = ({
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
    handleRenameCategory || handleDeleteCategory,
  )
  const showBulkActions = sortedCategoryUrls.length > 0
  const isCollapseDisabled = isDraggingCategory || isCategoryReorder

  const handleOpenAllUrlsConfirmed = () => {
    if (handleOpenAllUrls) {
      handleOpenAllUrls(sortedCategoryUrls)
      return
    }
    for (const item of sortedCategoryUrls) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleDeleteAllUrlsConfirmed = async () => {
    if (handleDeleteUrlsFromProject) {
      await handleDeleteUrlsFromProject(
        projectId,
        sortedCategoryUrls.map((item) => item.url),
      )
    } else {
      await Promise.all(
        sortedCategoryUrls.map((item) => handleDeleteUrl(projectId, item.url)),
      )
    }
  }

  const handleOpenAllClick = () => {
    if (shouldConfirmBulkOpen(sortedCategoryUrls.length)) {
      setIsOpenAllConfirmOpen(true)
      return
    }
    handleOpenAllUrlsConfirmed()
  }

  const handleDeleteAllClick = () => {
    if (settings.confirmDeleteAll) {
      setIsDeleteAllConfirmOpen(true)
      return
    }
    void handleDeleteAllUrlsConfirmed()
  }

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

  const handleConfirmDelete = () => {
    if (handleDeleteCategory) {
      handleDeleteCategory(projectId, category)
    }
    setShowManageDialog(false)
  }

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
          <CategoryHeaderActions
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
            isOver={isOver}
            category={category}
            projectId={projectId}
            categoryDropId={categoryDropId}
            setDroppableRef={setDroppableRef}
            handleOpenUrl={handleOpenUrl}
            handleDeleteUrl={handleDeleteUrl}
            handleSetUrlCategory={handleSetUrlCategory}
            settings={settings}
          />
        )}

        <CategoryManageDialog
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

      <CategoryBulkConfirmDialogs
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
