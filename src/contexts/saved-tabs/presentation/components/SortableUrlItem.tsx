import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { SortableUrlItemProps } from '@/types/saved-tabs'
import { TimeRemaining } from '@/utils/datetime'
import { formatFixedDatetime as formatDatetime } from '@/utils/localDateTime'

import { useSavedTabsUseCases } from '../controllers/SavedTabsUseCasesContext'
import { DeleteUrlConfirmDialog } from './shared/DeleteUrlConfirmDialog'

// グローバルのドロップ状態を追跡（ウィンドウ内でのドロップか外部へのドロップかを判定するため）
let isGlobalInternalDrop = false
if (typeof window !== 'undefined') {
  window.addEventListener('drop', () => {
    isGlobalInternalDrop = true
  })
}

// URL項目用のソータブルコンポーネント - 型定義を修正
export const SortableUrlItem = ({
  url,
  title,
  id,
  groupId,
  savedAt,
  autoDeletePeriod,
  handleDeleteUrl,
  handleOpenTab,
  categoryContext,
  settings,
}: SortableUrlItemProps) => {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      data: {
        categoryContext, // カテゴリコンテキストをデータに追加
      },
      id,
    })

  const isDraggingRef = useRef(false)
  const windowBlurredDuringDragRef = useRef(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  // 外部ウィンドウへの D&D 通知に使う `MessagingPort` (issue #531)。
  // `SavedTabsPage` 配下では `SavedTabsUseCasesProvider` が
  // `useCases.deps.messagingPort` を提供するため、`useSavedTabsUseCases()`
  // から取り出してそのまま使う。Provider 外 (Storybook / 一部テスト) では
  // `null` になるので、その場合は通知を no-op とする。
  const savedTabsUseCases = useSavedTabsUseCases()
  const messagingPort = savedTabsUseCases?.deps.messagingPort

  const handleWindowBlur = useCallback(() => {
    if (isDraggingRef.current) {
      windowBlurredDuringDragRef.current = true
    }
  }, [])

  // ドラッグが開始されたとき
  const handleDragStart = (e: React.DragEvent<HTMLElement>, url: string) => {
    isDraggingRef.current = true
    windowBlurredDuringDragRef.current = false
    isGlobalInternalDrop = false
    // URLをテキストとして設定
    e.dataTransfer.setData('text/plain', url)
    // URI-listとしても設定（多くのブラウザやアプリがこのフォーマットを認識）
    e.dataTransfer.setData('text/uri-list', url)

    // 外部ブラウザへのドラッグ判定のため、ウィンドウのblurを監視
    window.addEventListener('blur', handleWindowBlur)

    // ドラッグ開始をバックグラウンドに通知
    if (messagingPort) {
      void messagingPort.send({
        action: 'urlDragStarted',
        groupId,
        url,
      })
    }
  }

  // 外部ウィンドウへのドロップ処理
  const handleExternalDrop = useCallback(() => {
    if (!messagingPort) {
      return
    }
    // 外部へのドロップ時にタブを削除するよう通知
    void messagingPort.send({
      action: 'urlDropped',
      fromExternal: true,
      groupId,
      url,
    })
  }, [messagingPort, url, groupId])

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDragEnd = (e: React.DragEvent<HTMLElement>) => {
    // リスナーをクリーンアップ
    window.removeEventListener('blur', handleWindowBlur)

    const shouldHandleAsExternalDrop =
      !isGlobalInternalDrop &&
      isDraggingRef.current &&
      (e.dataTransfer.dropEffect === 'copy' ||
        (windowBlurredDuringDragRef.current &&
          e.dataTransfer.dropEffect === 'link'))

    if (shouldHandleAsExternalDrop) {
      handleExternalDrop()
    }

    isDraggingRef.current = false
    windowBlurredDuringDragRef.current = false
  }

  // コンポーネントのアンマウント時にクリーンアップ
  useEffect(
    () => () => {
      window.removeEventListener('blur', handleWindowBlur)
      isDraggingRef.current = false
      windowBlurredDuringDragRef.current = false
    },
    [handleWindowBlur],
  )

  // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDeleteButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (settings.confirmDeleteEach) {
      setIsDeleteConfirmOpen(true)
    } else {
      handleDeleteUrl(groupId, url)
    }
  }

  // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <>
      <li
        ref={setNodeRef}
        style={style}
        className='group relative flex min-w-0 items-center overflow-hidden pb-1 last:border-0 last:pb-0'
        data-category-context={categoryContext} // カテゴリコンテキストをdata属性に追加
      >
        <div
          className='z-10 shrink-0 cursor-grab px-2.5 text-muted-foreground hover:cursor-grab active:cursor-grabbing'
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} aria-hidden='true' />
        </div>
        <div className='relative min-w-0 flex-1 overflow-hidden'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            draggable
            // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
            onDragStart={(e) => {
              handleDragStart(e, url)
            }}
            onDragEnd={handleDragEnd}
            // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
            onClick={() => {
              handleOpenTab(url)
            }}
            className='ml-2 flex w-full min-w-0 cursor-pointer items-center justify-start gap-1 overflow-hidden bg-transparent px-1 py-2 pr-8 text-foreground hover:text-foreground'
          >
            <div className='flex w-full min-w-0 flex-col overflow-hidden'>
              <span className='block truncate text-left'>{title}</span>
              {/* 保存日時と残り時間を表示 - settings.showSavedTime に基づき条件分岐 */}
              {savedAt && (
                <div className='flex min-w-0 items-center gap-2 overflow-hidden text-xs'>
                  {settings.showSavedTime && (
                    <span className='truncate text-muted-foreground'>
                      {formatDatetime(savedAt)}
                    </span>
                  )}
                  {autoDeletePeriod && autoDeletePeriod !== 'never' && (
                    <TimeRemaining
                      savedAt={savedAt}
                      autoDeletePeriod={autoDeletePeriod}
                    />
                  )}
                </div>
              )}
            </div>
          </Button>
          <Button
            variant='ghost'
            size='icon'
            onClick={handleDeleteButtonClick}
            className='pointer-events-none invisible absolute top-0 right-0 bottom-0 my-auto shrink-0 cursor-pointer opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:visible focus-visible:opacity-100'
            title={t('savedTabs.url.deleteAria')}
            aria-label={t('savedTabs.url.deleteAria')}
          >
            <X size={14} />
          </Button>
        </div>
      </li>

      <DeleteUrlConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onConfirm={() => {
          handleDeleteUrl(groupId, url)
        }}
      />
    </>
  )
}
