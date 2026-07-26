import { CardCollapseControl } from '@/contexts/saved-tabs/presentation/components/shared/CardCollapseControl'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { useCategoryGroup } from './CategoryGroupContext'

export { CategoryGroupReorderControl } from './CategoryGroupReorderControl'
export { CategoryGroupSortControl } from './CategoryGroupSortControl'

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
