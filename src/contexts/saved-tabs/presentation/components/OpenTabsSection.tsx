import type { DragEndEvent } from '@dnd-kit/core'
import { DndContext } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import type { SavedTabSelectionItem } from '@/contexts/saved-tabs/presentation/components/selection/SavedTabsSelectionProvider'
import { useDndAccessibility } from '@/contexts/saved-tabs/presentation/hooks/useDndAccessibility'
import { useSavedTabsSensors } from '@/contexts/saved-tabs/presentation/hooks/useSavedTabsSensors'
import { getScopedNounActionLabel } from '@/contexts/saved-tabs/presentation/lib/accessibility'
import {
  favoriteUrlCollisionDetection,
  favoriteUrlKeyboardCoordinates,
} from '@/contexts/saved-tabs/presentation/lib/favorite-dnd'
import type { OpenTabsRow } from '@/contexts/saved-tabs/presentation/lib/open-tabs-display'
import {
  applyOpenTabsRowOrder,
  OPEN_TABS_CATEGORY_CONTEXT,
} from '@/contexts/saved-tabs/presentation/lib/open-tabs-display'
import type { SavedTabsUserSettingsDto as UserSettings } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'

import { ActionConfirmDialog } from './shared/ActionConfirmDialog'
import { CategoryBulkActionButtons } from './shared/CategoryBulkActionButtons'
import { SavedTabsResponsiveTooltipContent } from './shared/SavedTabsResponsive'
import { SortableUrlItem } from './SortableUrlItem'

const BULK_OPEN_THRESHOLD = 10
const NO_ROW_ORDER: readonly string[] = []

export type OpenTabsSectionProps = {
  mode?: 'domain' | 'custom'
  rows: readonly OpenTabsRow[]
  settings: UserSettings
  handleOpenAllTabs: (urls: { url: string; title: string }[]) => Promise<void>
  handleOpenTab: (url: string) => Promise<void>
  handleDeleteUrl: (groupId: string, url: string) => Promise<void>
  /** まとめ削除の fast path。未指定時は 1 行ずつ `handleDeleteUrl` を呼ぶ。 */
  handleDeleteUrls?: (groupId: string, urls: string[]) => Promise<void>
  /** One mode-owned atomic deletion and Undo for all displayed occurrences. */
  handleDeleteRows?: (items: SavedTabSelectionItem[]) => Promise<void>
}

type TooltipIconButtonProps = {
  icon: React.ComponentType<{ size: number }>
  onClick: (event: React.MouseEvent) => void
  ariaLabel: string
  tooltip: string
}

const TooltipIconButton = ({
  icon: Icon,
  onClick,
  ariaLabel,
  tooltip,
}: TooltipIconButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant='secondary'
        size='sm'
        onClick={onClick}
        className='flex cursor-pointer items-center gap-1'
        aria-label={ariaLabel}
      >
        <Icon size={14} />
      </Button>
    </TooltipTrigger>
    <SavedTabsResponsiveTooltipContent side='top'>
      {tooltip}
    </SavedTabsResponsiveTooltipContent>
  </Tooltip>
)

const OpenTabsCountBadge = ({
  count,
  label,
}: {
  count: number
  label: string
}) => (
  <span className='text-sm text-muted-foreground'>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant='secondary'>{count}</Badge>
      </TooltipTrigger>
      <SavedTabsResponsiveTooltipContent side='top'>
        {label}
      </SavedTabsResponsiveTooltipContent>
    </Tooltip>
  </span>
)

const groupRowsByGroupId = (
  rows: readonly OpenTabsRow[],
): { groupId: string; urls: string[] }[] => {
  const groups = new Map<string, string[]>()
  for (const row of rows) {
    const urls = groups.get(row.groupId)
    if (urls) {
      urls.push(row.url)
    } else {
      groups.set(row.groupId, [row.url])
    }
  }
  return [...groups].map(([groupId, urls]) => ({ groupId, urls }))
}

/**
 * 「今開いているタブ」セクション。各モードの親カテゴリ / プロジェクトと
 * 同系の見た目で、保存 URL のうちブラウザで開いている出現をフラットに並べる。
 * セクション自体は並び替え対象外 (親カテゴリ DnD に参加しない)。
 */
export const OpenTabsSection = ({
  // eslint-disable-next-line eslint/max-lines-per-function
  mode = 'domain',
  rows,
  settings,
  handleOpenAllTabs,
  handleOpenTab,
  handleDeleteUrl,
  handleDeleteUrls,
  handleDeleteRows,
}: OpenTabsSectionProps) => {
  const { t } = useI18n()
  const accessibility = useDndAccessibility('immediate')
  const sensors = useSavedTabsSensors(favoriteUrlKeyboardCoordinates)

  // ドラッグ順はセッション内のみ。open set は常時変化するため永続化しない。
  const [rowOrder, setRowOrder] = useState<readonly string[]>(NO_ROW_ORDER)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)

  const orderedRows = useMemo(
    () => applyOpenTabsRowOrder(rows, rowOrder),
    [rows, rowOrder],
  )
  const orderedRowIds = useMemo(
    () => orderedRows.map((row) => row.id),
    [orderedRows],
  )
  const urlsToOpen = useMemo(
    () => orderedRows.map((row) => ({ url: row.url, title: row.title })),
    [orderedRows],
  )
  const groupedForDeleteAll = useMemo(() => groupRowsByGroupId(rows), [rows])

  const collapseLabel = isCollapsed
    ? t('savedTabs.expand')
    : t('savedTabs.collapse')
  const CollapseIcon = isCollapsed ? ChevronDown : ChevronUp
  const openAllAriaLabel = getScopedNounActionLabel(
    t,
    t('savedTabs.openTabs.title'),
    t('savedTabs.openAllTabs'),
  )
  const deleteAllAriaLabel = getScopedNounActionLabel(
    t,
    t('savedTabs.openTabs.title'),
    t('savedTabs.deleteAllTabs'),
  )

  const handleToggleCollapse = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    setIsCollapsed((current) => !current)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) {
        return
      }
      setRowOrder((current) => {
        // ドラッグ時点の表示順 (未選択の新行は末尾追加) を対象に移動する
        const ids = applyOpenTabsRowOrder(rows, current).map((row) => row.id)
        const from = ids.indexOf(String(active.id))
        const to = ids.indexOf(String(over.id))
        if (from === -1 || to === -1) {
          return current
        }
        return arrayMove(ids, from, to)
      })
    },
    [rows],
  )

  const handleConfirmOpenAll = useCallback(() => {
    setIsOpenAllConfirmOpen(false)
    void handleOpenAllTabs(urlsToOpen)
  }, [handleOpenAllTabs, urlsToOpen])

  const handleOpenAllClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      if (urlsToOpen.length >= BULK_OPEN_THRESHOLD) {
        setIsOpenAllConfirmOpen(true)
        return
      }
      void handleOpenAllTabs(urlsToOpen)
    },
    [handleOpenAllTabs, urlsToOpen],
  )

  const deleteAllRows = useCallback(async () => {
    if (handleDeleteRows) {
      await handleDeleteRows(
        rows.map(({ groupId, url, title }) => ({ groupId, url, title })),
      )
      return
    }
    const deletions = groupedForDeleteAll.flatMap(({ groupId, urls }) =>
      handleDeleteUrls
        ? [async () => handleDeleteUrls(groupId, urls)]
        : urls.map((url) => async () => handleDeleteUrl(groupId, url)),
    )
    // Each fallback handler owns a read-modify-write and its Undo snapshot.
    await deletions.reduce(
      async (previous, remove) => previous.then(remove),
      Promise.resolve(),
    )
  }, [
    groupedForDeleteAll,
    handleDeleteRows,
    handleDeleteUrl,
    handleDeleteUrls,
    rows,
  ])

  const handleDeleteAllClick = useCallback(() => {
    setIsDeleteConfirmOpen(false)
    setIsDeleting(true)
    void deleteAllRows()
      .catch((error: unknown) => {
        console.error('開いているタブの削除に失敗しました:', error)
        toast.error(t('savedTabs.tab.deleteError'))
      })
      .finally(() => {
        setIsDeleting(false)
      })
  }, [deleteAllRows, t])

  const handleDeleteAllClickWithConfirm = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
      if (settings.confirmDeleteAll) {
        setIsDeleteConfirmOpen(true)
      } else {
        handleDeleteAllClick()
      }
    },
    [settings.confirmDeleteAll, handleDeleteAllClick],
  )

  return (
    <>
      <section
        className={cn(
          'w-full',
          mode === 'domain'
            ? 'mb-6'
            : 'mb-4 overflow-x-hidden rounded-xl border bg-card text-card-foreground shadow',
        )}
        data-testid='open-tabs-section'
      >
        <div
          className={cn(
            'sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-card',
            mode === 'domain' ? 'mb-2' : 'my-2 px-3',
          )}
        >
          <div className='flex min-w-0 items-center gap-2'>
            <TooltipIconButton
              icon={CollapseIcon}
              onClick={handleToggleCollapse}
              ariaLabel={collapseLabel}
              tooltip={collapseLabel}
            />
            <h2
              className={cn(
                'min-w-0 truncate text-xl font-semibold text-foreground',
                mode === 'custom' && 'py-2',
              )}
            >
              {t('savedTabs.openTabs.title')}
            </h2>
            <OpenTabsCountBadge
              count={orderedRows.length}
              label={t('savedTabs.sortableCategory.tabCountLabel')}
            />
          </div>
          <CategoryBulkActionButtons
            isDeleting={isDeleting}
            showDeleteAction
            openLabel={t('savedTabs.openAll')}
            openAriaLabel={openAllAriaLabel}
            openTooltip={openAllAriaLabel}
            deleteLabel={t('savedTabs.deleteAll')}
            deletingLabel={t('savedTabs.deletingAll')}
            deleteAriaLabel={deleteAllAriaLabel}
            deleteTooltip={deleteAllAriaLabel}
            onOpenAll={handleOpenAllClick}
            onDeleteAll={handleDeleteAllClickWithConfirm}
          />
        </div>
        {!isCollapsed && (
          <DndContext
            accessibility={accessibility}
            sensors={sensors}
            collisionDetection={favoriteUrlCollisionDetection}
            onDragEnd={handleDragEnd}
            id='open-tabs-rows'
          >
            <SortableContext
              items={orderedRowIds}
              strategy={verticalListSortingStrategy}
            >
              <ul
                className={cn(
                  'space-y-0.5',
                  mode === 'custom' &&
                    'space-y-2 overflow-hidden rounded border border-dashed border-muted px-3 [&>li]:border-b [&>li]:border-border [&>li:last-child]:pb-1',
                )}
              >
                {orderedRows.map((row) => (
                  <SortableUrlItem
                    isFavorite={row.isFavorite}
                    url={row.url}
                    title={row.title}
                    id={row.id}
                    groupId={row.groupId}
                    {...(row.savedAt !== undefined
                      ? { savedAt: row.savedAt }
                      : {})}
                    {...(settings.autoDeletePeriod !== undefined
                      ? { autoDeletePeriod: settings.autoDeletePeriod }
                      : {})}
                    // eslint-disable-next-line typescript/no-misused-promises
                    handleDeleteUrl={handleDeleteUrl}
                    // eslint-disable-next-line typescript/no-misused-promises
                    handleOpenTab={handleOpenTab}
                    categoryContext={OPEN_TABS_CATEGORY_CONTEXT}
                    settings={settings}
                    key={row.id}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {/* まとめて削除の確認ダイアログ */}
      <ActionConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title={t('savedTabs.sortableCategory.bulkDeleteTitle')}
        description={t('savedTabs.openTabs.deleteAllWarning')}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        variant='destructive'
        onConfirm={handleDeleteAllClick}
      />

      {/* すべて開く確認ダイアログ */}
      <ActionConfirmDialog
        open={isOpenAllConfirmOpen}
        onOpenChange={setIsOpenAllConfirmOpen}
        title={t('savedTabs.sortableCategory.bulkOpenTitle')}
        description={t(
          'savedTabs.openAllConfirmDescriptionWithName',
          undefined,
          {
            count: String(urlsToOpen.length),
            name: t('savedTabs.openTabs.title'),
          },
        )}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.open')}
        onConfirm={handleConfirmOpenAll}
      />
    </>
  )
}
