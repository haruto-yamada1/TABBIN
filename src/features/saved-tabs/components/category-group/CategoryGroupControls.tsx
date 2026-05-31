import { useI18n } from '@/features/i18n/context/I18nProvider'

import { CardCollapseControl } from '../shared/CardCollapseControl'
import { CardReorderControls } from '../shared/CardReorderControls'
import { CardSortControl } from '../shared/CardSortControl'
import { useCategoryGroup } from './CategoryGroupContext'

/** CategoryGroup の折りたたみ切り替えボタン */
export const CategoryGroupCollapseControl = () => {
  const { t } = useI18n()
  const { state, isCategoryReorderMode, category } = useCategoryGroup()
  const { collapse } = state

  return (
    <CardCollapseControl
      isCollapsed={collapse.isCollapsed}
      setIsCollapsed={collapse.setIsCollapsed}
      setUserCollapsedState={collapse.setUserCollapsedState}
      isDisabled={isCategoryReorderMode}
      disabledMessage={t('savedTabs.reorder.disabled')}
      targetName={category.name}
    />
  )
}

/** CategoryGroup のソート順切り替えボタン */
export const CategoryGroupSortControl = () => {
  const { state, category } = useCategoryGroup()
  const { sort } = state

  return (
    <CardSortControl
      sortOrder={sort.sortOrder}
      setSortOrder={sort.setSortOrder}
      targetName={category.name}
    />
  )
}

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
