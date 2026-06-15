import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import type { AssignDomainToCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/AssignDomainToCategoryUseCase'
import type { CreateParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/CreateParentCategoryUseCase'
import type { DeleteParentCategoryUseCase } from '@/contexts/saved-tabs/application/use-cases/DeleteParentCategoryUseCase'
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
  /** 保存タブページ全体 query (issue #510)。useCategoryModal へ伝搬。*/
  getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
  /** 親カテゴリ作成 use-case。useCategoryModal 経由で利用。*/
  createParentCategoryUseCase: CreateParentCategoryUseCase
  /** 親カテゴリ削除 use-case。useCategoryModal 経由で利用。*/
  deleteParentCategoryUseCase: DeleteParentCategoryUseCase
  /** ドメイン割当 use-case。useCategoryModal 経由で利用。*/
  assignDomainToCategoryUseCase: AssignDomainToCategoryUseCase
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
  getSavedTabsPageDataQuery,
  createParentCategoryUseCase,
  deleteParentCategoryUseCase,
  assignDomainToCategoryUseCase,
  children,
}: CategoryModalRootProps) => {
  const { t } = useI18n()
  const state = useCategoryModal({
    assignDomainToCategoryUseCase,
    createParentCategoryUseCase,
    deleteParentCategoryUseCase,
    getSavedTabsPageDataQuery,
    tabGroups,
  })

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
