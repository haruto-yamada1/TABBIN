import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, GripVertical, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { CustomProject, UserSettings } from '@/types/storage'

import {
  getCategoryDisplayName,
  getCategoryLevel,
} from './projectUrlItemHelpers'
import { DeleteUrlConfirmDialog } from './shared/DeleteUrlConfirmDialog'

// グローバルのドロップ状態を追跡（ウィンドウ内でのドロップか外部へのドロップかを判定するため）
let isGlobalInternalDrop = false
if (typeof window !== 'undefined') {
  window.addEventListener('drop', () => {
    isGlobalInternalDrop = true
  })
}

interface ProjectUrlItemProps {
  item: NonNullable<CustomProject['urls']>[0]
  projectId: string
  handleOpenUrl: (url: string) => void
  handleDeleteUrl: (projectId: string, url: string) => void
  handleSetCategory?: (
    projectId: string,
    url: string,
    category?: string,
  ) => void
  availableCategories?: string[]
  // 追加: 未分類エリア内にあるかどうかのフラグ
  isInUncategorizedArea?: boolean
  // 追加: 親要素のタイプ情報
  parentType?: string
  settings: UserSettings
}

const ProjectUrlItemComponent = ({
  item,
  projectId,
  handleOpenUrl,
  handleDeleteUrl,
  isInUncategorizedArea = false,
  parentType,
  settings,
}: ProjectUrlItemProps) => {
  const { t } = useI18n()
  // 実際のURLを保存（元のURL）
  const originalUrl = item.url

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const isDraggingRef = useRef(false)
  const windowBlurredDuringDragRef = useRef(false)

  // ドラッグアンドドロップの設定を強化
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    data: {
      type: 'url',
      url: originalUrl,
      projectId,
      title: item.title || originalUrl.substring(0, 30), // タイトルがない場合はURLの一部を使用
      isUncategorized: !item.category,
      category: item.category,
      notes: item.notes, // メタデータを保存
      isCategory: false, // URLであることを明示
      // カテゴリ操作に関する情報を追加
      canMoveToUncategorized: true,
      originalCategory: item.category,
      hasCategory: Boolean(item.category), // カテゴリ有無の明示的なフラグ
      // 親コンテナ情報を追加
      parent: parentType
        ? { type: parentType, id: `${parentType}-${projectId}` }
        : undefined,
      isInUncategorizedArea, // 未分類エリア内にあるかの情報を追加
    },
    id: originalUrl,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleExternalDrop = useCallback(() => {
    chrome.runtime.sendMessage(
      {
        action: 'urlDropped',
        fromExternal: true,
        groupId: projectId,
        url: originalUrl,
      },
      (response) => {
        console.log('外部ドロップ後の応答:', response)
      },
    )
  }, [originalUrl, projectId])

  const handleWindowBlur = useCallback(() => {
    if (isDraggingRef.current) {
      windowBlurredDuringDragRef.current = true
    }
  }, [])

  const handleDragStart = (e: React.DragEvent<HTMLElement>) => {
    isDraggingRef.current = true
    windowBlurredDuringDragRef.current = false
    isGlobalInternalDrop = false

    e.dataTransfer.setData('text/plain', originalUrl)
    e.dataTransfer.setData('text/uri-list', originalUrl)
    window.addEventListener('blur', handleWindowBlur)

    chrome.runtime.sendMessage(
      {
        action: 'urlDragStarted',
        groupId: projectId,
        url: originalUrl,
      },
      (response) => {
        console.log('ドラッグ開始通知の応答:', response)
      },
    )
  }

  const handleDragEnd = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
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
    },
    [handleWindowBlur, handleExternalDrop],
  )

  useEffect(
    () => () => {
      window.removeEventListener('blur', handleWindowBlur)
      isDraggingRef.current = false
      windowBlurredDuringDragRef.current = false
    },
    [handleWindowBlur],
  )

  // カテゴリの階層情報
  const categoryLevel = getCategoryLevel(item.category)
  const isInSubcategory = categoryLevel > 0

  return (
    <>
      <li
        ref={setNodeRef}
        style={style}
        className={`group relative flex min-w-0 items-center overflow-hidden border-b border-border pb-1 last:border-0 ${isDragging ? 'bg-secondary/50 opacity-50' : ''} ${isInSubcategory ? 'pl-2' : ''} ${item.category ? 'border-l-2 border-l-primary/30' : ''} `}
        data-url={originalUrl}
        data-project-id={projectId}
        data-category={item.category}
        data-has-category={Boolean(item.category)}
        data-category-level={categoryLevel}
        data-parent-type={parentType || ''}
        data-in-uncategorized={isInUncategorizedArea ? 'true' : 'false'}
      >
        <div
          {...attributes}
          {...listeners}
          className='cursor-grab p-1 active:cursor-grabbing'
        >
          <GripVertical size={16} className='text-muted-foreground' />
        </div>
        {/* タイトル＋バッジ部 */}
        <div className='flex min-w-0 flex-1 items-center'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => {
              handleOpenUrl(item.url)
            }}
            className='flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left text-foreground hover:text-foreground hover:underline'
          >
            {/* サブカテゴリ付きのURLの場合はChevronRightを表示 */}
            {item.category?.includes('/') && (
              <ChevronRight
                size={14}
                className='mr-1 inline-block text-primary'
              />
            )}
            <span className='min-w-0 flex-1 truncate'>
              {item.title || item.url}
            </span>
            {/* カテゴリ階層の視覚的な表示をシンプル化 */}
            {item.category?.includes('/') && (
              <Badge variant='outline' className='ml-2 shrink-0 text-xs'>
                {getCategoryDisplayName(item.category)}
              </Badge>
            )}
          </Button>
        </div>
        {/* ボタン群 */}
        <div className='flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100'>
          <Button
            variant='ghost'
            size='sm'
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (settings.confirmDeleteEach) {
                setIsDeleteConfirmOpen(true)
              } else {
                handleDeleteUrl(projectId, item.url)
              }
            }}
            className='size-8 cursor-pointer p-0'
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
        onConfirm={() => {
          handleDeleteUrl(projectId, item.url)
        }}
      />
    </>
  )
}

const ProjectUrlItem = memo(ProjectUrlItemComponent)
ProjectUrlItem.displayName = 'ProjectUrlItem'

export type { ProjectUrlItemProps }
export { ProjectUrlItem }
