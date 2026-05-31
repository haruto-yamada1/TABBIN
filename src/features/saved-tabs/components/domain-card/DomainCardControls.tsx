import { useI18n } from '@/features/i18n/context/I18nProvider'

import { CardCollapseControl } from '../shared/CardCollapseControl'
import { CardReorderControls } from '../shared/CardReorderControls'
import { CardSortControl } from '../shared/CardSortControl'
import { useDomainCard } from './DomainCardContext'

/** DomainCard の折りたたみ切り替えボタン */
export const DomainCardCollapseControl = () => {
  const { t } = useI18n()
  const { state, isReorderMode, group } = useDomainCard()
  const { collapse } = state

  return (
    <CardCollapseControl
      isCollapsed={collapse.isCollapsed}
      setIsCollapsed={collapse.setIsCollapsed}
      setUserCollapsedState={collapse.setUserCollapsedState}
      isDisabled={isReorderMode}
      disabledMessage={t('savedTabs.reorder.disabled')}
      targetName={group.domain}
    />
  )
}

/** DomainCard のソート順切り替えボタン */
export const DomainCardSortControl = () => {
  const { state, group } = useDomainCard()
  const { sort } = state

  return (
    <CardSortControl
      sortOrder={sort.sortOrder}
      setSortOrder={sort.setSortOrder}
      targetName={group.domain}
    />
  )
}

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
