import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { CategoryKeywordModalProps } from '@/types/saved-tabs'

import { useCategoryKeywordModal } from '../../hooks/useCategoryKeywordModal'
import { KeywordModalContext } from './KeywordModalContext'
import type { KeywordModalContextType } from './KeywordModalContext'

const EMPTY_PARENT_CATEGORIES: NonNullable<
  CategoryKeywordModalProps['parentCategories']
> = []

/** KeywordModalRoot の props */
interface KeywordModalRootProps {
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
  /**
   * storage 変更通知 port。`chrome.storage.onChanged` の直叩きは禁止の
   * ため、presentation 層は本 port 経由でのみ storage 変更を購読する。
   * 未指定時は購読を行わない（テストや SSR など chrome 依存を完全に
   * 切りたい場合用）。
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
  storageChangePort,
  children,
}: KeywordModalRootProps) => {
  const { t } = useI18n()
  const state = useCategoryKeywordModal({
    group,
    initialParentCategories,
    isOpen,
    onDeleteCategory,
    onSave,
    onUpdateParentCategories,
    storageChangePort,
  })

  if (!isOpen) {
    return null
  }

  // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
  const contextValue: KeywordModalContextType = {
    group,
    state,
  }

  return (
    <KeywordModalContext value={contextValue}>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className='max-h-[90vh] overflow-y-auto'
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onClick={(e) => {
            e.stopPropagation()
          }}
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
            }
          }}
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
