import { useCallback, useMemo } from 'react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CategoryAssignmentPort } from '@/contexts/saved-tabs/application/ports/CategoryAssignmentPort'
import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import { useCategoryKeywordModal } from '@/contexts/saved-tabs/presentation/hooks/useCategoryKeywordModal'
import type { CategoryKeywordModalProps } from '@/contexts/saved-tabs/presentation/types/SavedTabsComponentProps'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { KeywordModalContext } from './KeywordModalContext'
import type { KeywordModalContextType } from './KeywordModalContext'

const EMPTY_PARENT_CATEGORIES: NonNullable<
  CategoryKeywordModalProps['parentCategories']
> = []

/** KeywordModalRoot の props */
type KeywordModalRootProps = {
  /** タブグループデータ */
  group: CategoryKeywordModalProps['group']
  /** モーダル開閉状態 */
  isOpen: boolean
  /** 閉じるハンドラ */
  onClose: () => void
  /** キーワード保存ハンドラ */
  onSave: CategoryKeywordModalProps['onSave']
  /** カテゴリ削除ハンドラ */
  onDeleteCategory: CategoryKeywordModalProps['onDeleteCategory']
  /** 親カテゴリ一覧 */
  initialParentCategories?: CategoryKeywordModalProps['parentCategories']
  /** 親カテゴリ更新ハンドラ */
  onUpdateParentCategories?: CategoryKeywordModalProps['onUpdateParentCategories']
  /** 永続化依存 (issue #510) */
  deps: {
    categoryAssignmentPort: CategoryAssignmentPort
    getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
  }
  /**
   * storage 変更通知 port。`StorageChangePort` 経由でのみ storage 変更を
   * 購読する（issue #503）。chrome API の詳細は infrastructure 層の
   * `ChromeStorageChangeAdapter` に閉じ込めており、presentation 層から
   * 購読 / 解除を直接行う場合は本 port を使う。未指定時は購読を行わない
   * （テストや SSR など chrome 依存を完全に切りたい場合用）。
   */
  readonly storageChangePort?: StorageChangePort
  /** 子コンポーネント */
  children: React.ReactNode
}

/**
 * KeywordModal の複合コンポーネントルート
 * Dialog + useCategoryKeywordModal を提供する
 * @param props KeywordModalRootProps
 */
export const KeywordModalRoot = ({
  group,
  isOpen,
  onClose,
  onSave,
  onDeleteCategory,
  initialParentCategories = EMPTY_PARENT_CATEGORIES,
  onUpdateParentCategories,
  deps,
  storageChangePort,
  children,
}: KeywordModalRootProps) => {
  const { t } = useI18n()
  const state = useCategoryKeywordModal({
    deps,
    group,
    initialParentCategories,
    isOpen,
    onDeleteCategory,
    onSave,
    onUpdateParentCategories,
    storageChangePort,
  })

  const contextValue: KeywordModalContextType = useMemo(
    () => ({ group, state }),
    [group, state],
  )

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const handleContentPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
  }, [])

  const handleContentKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation()
    }
  }, [])

  if (!isOpen) {
    return null
  }

  return (
    <KeywordModalContext value={contextValue}>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className='max-h-[90vh] overflow-y-auto'
          onClick={handleContentClick}
          onPointerDown={handleContentPointerDown}
          onKeyDown={handleContentKeyDown}
        >
          <DialogHeader className='text-left'>
            <DialogTitle>
              {t('savedTabs.keywordModal.title', undefined, {
                domain: group.domain,
              })}
            </DialogTitle>
          </DialogHeader>

          <div ref={state.modalContentRef} className='space-y-4'>
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </KeywordModalContext>
  )
}
