import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { TabGroup } from '@/types/storage'

import { useCategoryModal } from '../../hooks/useCategoryModal'
import { CategoryModalContext } from './CategoryModalContext'
import type { CategoryModalContextType } from './CategoryModalContext'

/** CategoryModalRoot の props */
interface CategoryModalRootProps {
  /** モーダルを閉じるハンドラ */
  onClose: () => void
  /** タブグループ一覧 */
  tabGroups: TabGroup[]
  /** 子コンポーネント */
  children: React.ReactNode
}

/**
 * CategoryModal の複合コンポーネントルート
 * Dialog + useCategoryModal を提供する
 * @param props CategoryModalRootProps
 */
export const CategoryModalRoot = ({
  onClose,
  tabGroups,
  children,
}: CategoryModalRootProps) => {
  const { t } = useI18n()
  const state = useCategoryModal({ tabGroups })

  // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
  const contextValue: CategoryModalContextType = {
    state,
    tabGroups,
  }

  return (
    <CategoryModalContext value={contextValue}>
      <Dialog
        open
        // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onOpenChange={() => {
          onClose()
        }}
      >
        <DialogContent className='flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[500px]'>
          <DialogHeader>
            <DialogTitle>{t('savedTabs.categoryModal.title')}</DialogTitle>
          </DialogHeader>
          <div className='grid gap-4 overflow-y-auto py-4 pr-1'>{children}</div>
        </DialogContent>
      </Dialog>
    </CategoryModalContext>
  )
}
