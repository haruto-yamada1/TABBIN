import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, GripVertical, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { useSavedTabsUseCases } from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import {
  getCategoryDisplayName,
  getCategoryLevel,
} from './projectUrlItemHelpers'
import { DeleteUrlConfirmDialog } from './shared/DeleteUrlConfirmDialog'

const MAX_URL_PREVIEW_LENGTH = 30

// グローバルのドロップ状態を追跡（ウィンドウ内でのドロップか外部へのドロップかを判定するため）
let isGlobalInternalDrop = false
if (typeof window !== 'undefined') {
  window.addEventListener('drop', () => {
    isGlobalInternalDrop = true
  })
}

type ProjectUrlItemProps = {
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
  settings: UserSettingsDto
}

// eslint-disable-next-line eslint/complexity
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
  // 外部ウィンドウへの D&D 通知に使う `MessagingPort` (issue #531)。
  // `SavedTabsPage` 配下では `SavedTabsUseCasesProvider` が
  // `useCases.deps.messagingPort` を提供するため、`useSavedTabsUseCases()`
  // から取り出してそのまま使う。Provider 外 (Storybook / 一部テスト) では
  // `null` になるので、その場合は通知を no-op とする。
  const savedTabsUseCases = useSavedTabsUseCases()
  const messagingPort = savedTabsUseCases?.deps.messagingPort

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
      title: item.title || originalUrl.substring(0, MAX_URL_PREVIEW_LENGTH), // タイトルがない場合はURLの一部を使用
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

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  )

  const handleExternalDrop = useCallback(() => {
    if (!messagingPort) {
      return
    }
    void messagingPort.send({
      action: 'urlDropped',
      fromExternal: true,
      groupId: projectId,
      url: originalUrl,
    })
  }, [messagingPort, originalUrl, projectId])

  const handleWindowBlur = useCallback(() => {
    if (isDraggingRef.current) {
      windowBlurredDuringDragRef.current = true
    }
  }, [])

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      isDraggingRef.current = true
      windowBlurredDuringDragRef.current = false
      isGlobalInternalDrop = false

      e.dataTransfer.setData('text/plain', originalUrl)
      e.dataTransfer.setData('text/uri-list', originalUrl)
      window.addEventListener('blur', handleWindowBlur)

      if (messagingPort) {
        void messagingPort.send({
          action: 'urlDragStarted',
          groupId: projectId,
          url: originalUrl,
        })
      }
    },
    [originalUrl, messagingPort, projectId, handleWindowBlur],
  )

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

  const handleUrlClick = useCallback(() => {
    handleOpenUrl(item.url)
  }, [handleOpenUrl, item.url])

  const handleDeleteButtonClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (settings.confirmDeleteEach) {
        setIsDeleteConfirmOpen(true)
      } else {
        handleDeleteUrl(projectId, item.url)
      }
    },
    [settings.confirmDeleteEach, handleDeleteUrl, projectId, item.url],
  )

  const handleConfirmDelete = useCallback(() => {
    handleDeleteUrl(projectId, item.url)
  }, [handleDeleteUrl, projectId, item.url])

  return (
    <>
      <li
        ref={setNodeRef}
        style={style}
        className={`group relative flex min-w-0 items-center overflow-hidden border-b border-border pb-1 last:border-0 ${isDragging ? 'bg-secondary/50 opacity-50' : ''} ${isInSubcategory ? 'pl-2' : ''} ${item.category ? 'border-l-2 border-l-primary/30' : ''} `}
        data-testid='project-url-item'
        data-url={originalUrl}
        data-project-id={projectId}
        data-category={item.category}
        data-has-category={Boolean(item.category)}
        data-category-level={categoryLevel}
        data-parent-type={parentType ?? ''}
        data-in-uncategorized={isInUncategorizedArea ? 'true' : 'false'}
      >
        <div
          {...attributes}
          {...listeners}
          aria-label={t('savedTabs.url.dragHandleAria', undefined, {
            name: item.title || originalUrl,
          })}
          className='cursor-grab p-1 active:cursor-grabbing'
          data-testid='project-url-drag-handle'
        >
          <GripVertical
            size={16}
            aria-hidden='true'
            className='text-muted-foreground'
          />
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
            onClick={handleUrlClick}
            className='flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left text-foreground hover:text-foreground hover:underline'
          >
            {/* サブカテゴリ付きのURLの場合はChevronRightを表示 */}
            {item.category?.includes('/') && (
              <ChevronRight
                size={14}
                className='mr-1 inline-block text-primary'
              />
            )}
            <span
              className='min-w-0 flex-1 truncate'
              data-testid='project-url-title'
            >
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
        <div
          className='flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100'
          data-testid='project-url-action-bar'
        >
          <Button
            variant='ghost'
            size='sm'
            onClick={handleDeleteButtonClick}
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
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

const ProjectUrlItem = memo(ProjectUrlItemComponent)
ProjectUrlItem.displayName = 'ProjectUrlItem'

export type { ProjectUrlItemProps }
export { ProjectUrlItem }
