import { CardReorderControls } from '../shared/CardReorderControls'
import { useCategoryGroup } from './CategoryGroupContext'

/** CategoryGroup のドメイン並び替え確定・キャンセルボタン */
export const CategoryGroupReorderControl = () => {
  const { state } = useCategoryGroup()
  const { reorder } = state

  return (
    <CardReorderControls
      isReorderMode={reorder.isReorderMode}
      onCancel={reorder.handleCancelReorder}
      onConfirm={reorder.handleConfirmReorder}
      className='pointer-events-auto ml-2 gap-2'
    />
  )
}
