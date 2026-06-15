import { GripVertical } from 'lucide-react'
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
import type { UserSettingsDto as UserSettings } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import { getScopedNounActionLabel } from '@/contexts/saved-tabs/presentation/lib/accessibility'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { SortableCategorySectionProps } from '@/types/saved-tabs'

import { CategoryBulkActionButtons } from './shared/CategoryBulkActionButtons'
import { OpenAllTabsConfirmDialog } from './shared/OpenAllTabsConfirmDialog'
import { useSortableCategoryDrag } from './shared/useSortableCategoryDrag'
import { CategorySection } from './TimeRemaining'

const BULK_OPEN_THRESHOLD = 10

// 並び替え可能なカテゴリセクションコンポーネント
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SortableCategorySection = ({
  id,
  handleOpenAllTabs,
  handleDeleteAllTabs, // 削除ハンドラを追加
  settings,
  ...props
}: SortableCategorySectionProps & {
  settings: UserSettings
  handleDeleteAllTabs?: (urls: { url: string }[]) => void // 新しいプロップの型定義
}) => {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, isDragging, style } =
    useSortableCategoryDrag(id)

  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)
  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)

  const categoryDisplayName =
    props.categoryName === '__uncategorized'
      ? t('savedTabs.uncategorized')
      : props.categoryName
  const urls = useMemo(() => props.urls ?? [], [props.urls])
  const urlCount = urls.length

  /**
   * カテゴリ内の全タブを削除する処理（確認済みの場合に呼び出す）
   *
   * `handleDeleteAllTabs` が指定されていればそれを呼ぶ。`@/lib/storage/tabs`
   * 直叩きフォールバックは issue #501 で撤去済み（presentation 層は
   * use-case / repository 経由で削除する）。
   */
  const executeDeleteAllTabs = useCallback(async () => {
    if (isDeleting) {
      return
    }
    setIsDeleting(true)
    try {
      const urlsToDelete = [...urls]
      const urlsToRemove = urlsToDelete.map((item) => item.url)
      if (handleDeleteAllTabs) {
        // eslint-disable-next-line typescript/no-confusing-void-expression
        await handleDeleteAllTabs(urlsToDelete) // eslint-disable-line typescript/await-thenable
      } else {
        // 削除ハンドラ未指定時は no-op（presentation 層から
        // `@/lib/storage/tabs.removeUrlsFromTabGroup` を直叩きしない）。
        console.warn(
          '[SavedTabsContent] handleDeleteAllTabs が未指定のため、URL 削除をスキップしました',
        )
      }
      console.log(
        `カテゴリ「${categoryDisplayName}」から${urlsToRemove.length}件のURLを削除しました`,
      )
    } catch (error) {
      console.error('削除処理中にエラーが発生しました:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [categoryDisplayName, handleDeleteAllTabs, isDeleting, urls])

  // 削除ボタンクリック時の処理
  const onDeleteAllTabs = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsDeleteAllConfirmOpen(true)
  }, [])

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={
          isDragging
            ? 'category-section mb-1 rounded-md bg-muted shadow-lg'
            : 'category-section mb-1'
        }
      >
        <div className='category-header mb-0.5 flex items-center justify-between border-b border-border pb-0.5'>
          {/* ドラッグハンドル部分 */}
          <div
            className={`flex grow items-center ${isDragging ? 'cursor-grabbing' : 'cursor-grab hover:cursor-grab active:cursor-grabbing'}`}
            {...attributes}
            {...listeners}
          >
            <div className='mr-2 text-muted-foreground'>
              <GripVertical size={16} aria-hidden='true' />
            </div>
            <h3 className='font-medium text-foreground'>
              {categoryDisplayName}{' '}
              <span className='text-sm text-muted-foreground'>
                ({urlCount})
              </span>
            </h3>
          </div>

          <CategoryBulkActionButtons
            isDeleting={isDeleting}
            showDeleteAction={Boolean(handleDeleteAllTabs)}
            openLabel={t('savedTabs.openAll')}
            openAriaLabel={getScopedNounActionLabel(
              t,
              categoryDisplayName,
              t('savedTabs.openAllTabs'),
            )}
            openTooltip={getScopedNounActionLabel(
              t,
              categoryDisplayName,
              t('savedTabs.openAllTabs'),
            )}
            deleteLabel={t('savedTabs.deleteAll')}
            deletingLabel={t('savedTabs.deletingAll')}
            deleteAriaLabel={getScopedNounActionLabel(
              t,
              categoryDisplayName,
              t('savedTabs.deleteAllTabs'),
            )}
            deleteTooltip={getScopedNounActionLabel(
              t,
              categoryDisplayName,
              t('savedTabs.deleteAllTabs'),
            )}
            // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
            onOpenAll={(e) => {
              if (urlCount >= BULK_OPEN_THRESHOLD) {
                e.stopPropagation()
                setIsOpenAllConfirmOpen(true)
                return
              }
              e.stopPropagation()
              handleOpenAllTabs(urls)
            }}
            onDeleteAll={onDeleteAllTabs}
          />
        </div>

        <CategorySection {...props} urls={urls} settings={settings} />
      </div>

      <OpenAllTabsConfirmDialog
        open={isOpenAllConfirmOpen}
        onOpenChange={setIsOpenAllConfirmOpen}
        title={t('savedTabs.openAllConfirmTitle')}
        description={t('savedTabs.openAllConfirmDescription', undefined, {
          count: '10',
        })}
        cancelLabel={t('common.cancel')}
        openLabel={t('common.open')}
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onConfirm={() => handleOpenAllTabs(urls)} // eslint-disable-line typescript/no-confusing-void-expression
      />

      {/* カテゴリ全削除確認ダイアログ */}
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
              {t('savedTabs.deleteAllConfirmDescription', undefined, {
                categoryName: categoryDisplayName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={() => void executeDeleteAllTabs()}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
