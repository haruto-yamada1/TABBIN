import { useDndMonitor } from '@dnd-kit/core'
import {
  ArrowUpDown,
  ArrowUpNarrowWide,
  ArrowUpWideNarrow,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

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
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import type { ReorderTabGroupUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/ReorderTabGroupUrlsUseCase'
import type { UserSettingsDto as UserSettings } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import {
  getScopedNounActionLabel,
  getScopedObjectActionLabel,
  getScopedSortLabel,
} from '@/contexts/saved-tabs/presentation/lib/accessibility'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { SortableCategorySectionProps } from '@/types/saved-tabs'

import { CategoryBulkActionButtons } from './shared/CategoryBulkActionButtons'
import { SavedTabsResponsiveTooltipContent } from './shared/SavedTabsResponsive'
import { useSortableCategoryDrag } from './shared/useSortableCategoryDrag'
import { CategorySection } from './TimeRemaining'

const BULK_OPEN_THRESHOLD = 10

type SortOrder = 'default' | 'asc' | 'desc'

const nextSortOrderMap: Record<SortOrder, SortOrder> = {
  asc: 'desc',
  default: 'asc',
  desc: 'default',
}

const sortIconMap = {
  asc: ArrowUpNarrowWide,
  default: ArrowUpDown,
  desc: ArrowUpWideNarrow,
} as const

const getCollapseTooltipText = (
  isReorderMode: boolean,
  isCollapsed: boolean,
  t: (
    key: string,
    fallback?: string,
    values?: Record<string, string>,
  ) => string,
): string => {
  if (isReorderMode) {
    return t('savedTabs.reorder.disabled')
  }
  return isCollapsed ? t('savedTabs.expand') : t('savedTabs.collapse')
}

const getCollapseIcon = (isCollapsed: boolean) =>
  isCollapsed ? ChevronDown : ChevronUp

const getCollapseButtonClassName = (isReorderMode: boolean): string =>
  `flex items-center gap-1 ${
    isReorderMode ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
  }`

const openTabsWithConfirm = ({
  urlCount,
  setIsOpenAllConfirmOpen,
  handleOpenAllTabs,
  urls,
}: {
  urlCount: number
  setIsOpenAllConfirmOpen: (open: boolean) => void
  handleOpenAllTabs: SortableCategorySectionProps['handleOpenAllTabs']
  urls: Parameters<SortableCategorySectionProps['handleOpenAllTabs']>[0]
}) => {
  if (urlCount >= BULK_OPEN_THRESHOLD) {
    setIsOpenAllConfirmOpen(true)
    return
  }
  handleOpenAllTabs(urls)
}

// 並び替え可能なカテゴリセクションコンポーネント
type SortableCategorySectionViewProps = SortableCategorySectionProps & {
  settings: UserSettings
  handleDeleteAllTabs?: (urls: { url: string }[]) => void
  /**
   * URL 並び替え use-case。`@/lib/storage/tabs.reorderTabGroupUrls`
   * 直叩きを置換（issue #501）。
   */
  reorderTabGroupUrlsUseCase?: ReorderTabGroupUrlsUseCase
}

const useSortableCategorySectionView = ({
  // eslint-disable-line eslint/max-lines-per-function
  id,
  handleOpenAllTabs,
  handleDeleteAllTabs, // 削除ハンドラを追加
  settings,
  stickyTop = 'top-16', // デフォルト値を設定
  isReorderMode = false, // 並び替えモード状態
  reorderTabGroupUrlsUseCase,
  ...props
}: SortableCategorySectionViewProps) => {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, isDragging, style } =
    useSortableCategoryDrag(id)

  const [isDeleting, setIsDeleting] = useState(false)
  // Sort order state: 'default' preserves manual drag order
  const [sortOrder, setSortOrder] = useState<SortOrder>('default')
  const urls = useMemo(() => props.urls ?? [], [props.urls])
  const urlCount = urls.length
  // Derive sorted urls by savedAt (default = original order)
  const sortedUrls = useMemo(() => {
    if (sortOrder === 'default') {
      return urls
    }
    const arr = [...urls]
    arr.sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0))
    if (sortOrder === 'desc') {
      arr.reverse()
    }
    return arr
  }, [urls, sortOrder])

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)
  const [isDragCollapsed, setIsDragCollapsed] = useState(false)
  const [userCollapsedState, setUserCollapsedState] = useState(false)
  const displayedCategoryName =
    props.categoryName === '__uncategorized'
      ? t('savedTabs.uncategorized')
      : props.categoryName
  const isCollapsed = isReorderMode || isDragCollapsed || userCollapsedState
  const sectionClassName = isDragging
    ? 'category-section mb-1 rounded-md bg-muted shadow-lg'
    : 'category-section mb-1'
  const sortLabelMap: Record<SortOrder, string> = {
    asc: t('savedTabs.sort.asc'),
    default: t('savedTabs.sort.default'),
    desc: t('savedTabs.sort.desc'),
  }
  const sortLabel = getScopedSortLabel(
    t,
    displayedCategoryName,
    sortLabelMap[sortOrder],
  )
  const SortIcon = sortIconMap[sortOrder]
  const CollapseIcon = getCollapseIcon(isCollapsed)
  const collapseButtonClassName = getCollapseButtonClassName(isReorderMode)
  const collapseButtonLabel = getScopedObjectActionLabel(
    t,
    displayedCategoryName,
    isCollapsed ? t('savedTabs.expand') : t('savedTabs.collapse'),
  )
  const collapseTooltipText = isReorderMode
    ? getCollapseTooltipText(isReorderMode, isCollapsed, t)
    : collapseButtonLabel
  const openAllTabsLabel = getScopedNounActionLabel(
    t,
    displayedCategoryName,
    t('savedTabs.openAllTabs'),
  )
  const deleteAllTabsLabel = getScopedNounActionLabel(
    t,
    displayedCategoryName,
    t('savedTabs.deleteAllTabs'),
  )

  const handleToggleCollapse = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    setUserCollapsedState((current) => !current)
  }, [])

  const handleToggleSort = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    setSortOrder((current) => nextSortOrderMap[current])
  }, [])

  const handleOpenAllClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      openTabsWithConfirm({
        handleOpenAllTabs,
        setIsOpenAllConfirmOpen,
        urlCount,
        urls,
      })
    },
    [handleOpenAllTabs, urlCount, urls],
  )

  const handleConfirmOpenAll = useCallback(() => {
    setIsOpenAllConfirmOpen(false)
    handleOpenAllTabs(urls)
  }, [handleOpenAllTabs, urls])

  const onDeleteAllTabsConfirmed = useCallback(async () => {
    setIsDeleteConfirmOpen(false)
    setIsDeleting(true)
    try {
      const urlsToDelete = [...urls]
      // eslint-disable-next-line typescript/await-thenable
      await handleDeleteAllTabs?.(urlsToDelete)
    } catch (error) {
      console.error('削除処理中にエラーが発生しました:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [urls, handleDeleteAllTabs])

  const onDeleteAllTabs = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (settings.confirmDeleteAll) {
        setIsDeleteConfirmOpen(true)
      } else {
        void onDeleteAllTabsConfirmed()
      }
    },
    [settings.confirmDeleteAll, onDeleteAllTabsConfirmed],
  )

  const handleDragEndOrCancel = useCallback(() => {
    setIsDragCollapsed(false)
  }, [])

  const handleDeleteAllClick = useCallback(() => {
    void onDeleteAllTabsConfirmed()
  }, [onDeleteAllTabsConfirmed])

  useDndMonitor({
    onDragCancel: handleDragEndOrCancel,
    onDragEnd: handleDragEndOrCancel,
    onDragStart: () => {
      setIsDragCollapsed(true)
    },
  })

  return (
    <div>
      <div
        ref={setNodeRef}
        style={style}
        className={sectionClassName}
        data-saved-tabs-scroll-target='child'
      >
        <div
          className={`category-header sticky ${stickyTop} z-30 mb-0.5 flex items-center justify-between gap-2 bg-background pb-0.5`}
        >
          {/* 折りたたみ切り替えボタン */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                onClick={handleToggleCollapse}
                className={collapseButtonClassName}
                aria-label={collapseButtonLabel}
                disabled={isReorderMode}
              >
                <CollapseIcon size={14} />
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {collapseTooltipText}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
          {/* ソート順切り替え */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='secondary'
                size='sm'
                onClick={handleToggleSort}
                className='flex cursor-pointer items-center gap-1'
                aria-label={sortLabel}
              >
                <SortIcon size={14} />
              </Button>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              {sortLabel}
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
          {/* ドラッグハンドル部分 */}
          <div
            className={`flex grow items-center gap-2 ${isDragging ? 'cursor-grabbing' : 'cursor-grab hover:cursor-grab active:cursor-grabbing'}`}
            {...attributes}
            {...listeners}
          >
            <div className='text-muted-foreground'>
              <GripVertical size={16} aria-hidden='true' />
            </div>
            <h3 className='font-medium text-foreground'>
              {displayedCategoryName}
            </h3>
            <span className='text-sm text-muted-foreground'>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant='secondary'>{urlCount}</Badge>
                </TooltipTrigger>
                <SavedTabsResponsiveTooltipContent side='top'>
                  {t('savedTabs.sortableCategory.tabCountLabel')}
                </SavedTabsResponsiveTooltipContent>
              </Tooltip>
            </span>
          </div>

          <CategoryBulkActionButtons
            isDeleting={isDeleting}
            showDeleteAction={Boolean(handleDeleteAllTabs)}
            openLabel={t('savedTabs.openAll')}
            openAriaLabel={openAllTabsLabel}
            openTooltip={openAllTabsLabel}
            deleteLabel={t('savedTabs.deleteAll')}
            deletingLabel={t('savedTabs.deletingAll')}
            deleteAriaLabel={deleteAllTabsLabel}
            deleteTooltip={deleteAllTabsLabel}
            onOpenAll={handleOpenAllClick}
            onDeleteAll={onDeleteAllTabs}
          />
        </div>

        {!isCollapsed && (
          <CategorySection
            {...props}
            urls={sortedUrls}
            settings={settings}
            scrollTarget={false}
            reorderTabGroupUrlsUseCase={reorderTabGroupUrlsUseCase}
          />
        )}
      </div>

      {/* 削除確認ダイアログ */}
      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.sortableCategory.bulkDeleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'savedTabs.sortableCategory.bulkDeleteDescription',
                undefined,
                {
                  name: displayedCategoryName,
                },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={handleDeleteAllClick}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* すべて開く確認ダイアログ */}
      <AlertDialog
        open={isOpenAllConfirmOpen}
        onOpenChange={setIsOpenAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.sortableCategory.bulkOpenTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.openAllConfirmDescriptionWithName', undefined, {
                count: String(urlCount),
                name: displayedCategoryName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOpenAll}>
              {t('common.open')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export const SortableCategorySection = (
  props: SortableCategorySectionViewProps,
) => useSortableCategorySectionView(props)
