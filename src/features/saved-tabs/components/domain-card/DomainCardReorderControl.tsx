import { CardReorderControls } from '../shared/CardReorderControls'
import { useDomainCard } from './DomainCardContext'

/** DomainCard の子カテゴリ並び替え確定・キャンセルボタン */
export const DomainCardReorderControl = () => {
  const { state } = useDomainCard()
  const { categoryReorder } = state

  return (
    <CardReorderControls
      isReorderMode={categoryReorder.isCategoryReorderMode}
      onCancel={categoryReorder.handleCancelCategoryReorder}
      onConfirm={categoryReorder.handleConfirmCategoryReorder}
    />
  )
}
