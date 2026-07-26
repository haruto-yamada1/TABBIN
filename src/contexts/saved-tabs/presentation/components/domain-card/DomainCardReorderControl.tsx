import { CardReorderControls } from '@/contexts/saved-tabs/presentation/components/shared/CardReorderControls'

import { useDomainCard } from './DomainCardContext'

/** DomainCard の子カテゴリ並び替え確定・キャンセルボタン */
export const DomainCardReorderControl = () => {
  const { state } = useDomainCard()
  const { categoryReorder } = state

  return (
    <CardReorderControls
      isReorderMode={categoryReorder.isCategoryReorderMode}
      onCancel={categoryReorder.handleCancelCategoryReorder}
      // eslint-disable-next-line typescript/no-misused-promises
      onConfirm={categoryReorder.handleConfirmCategoryReorder}
    />
  )
}
