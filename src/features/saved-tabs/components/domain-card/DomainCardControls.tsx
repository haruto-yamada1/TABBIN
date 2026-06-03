import { useI18n } from '@/features/i18n/context/I18nProvider'

import { CardCollapseControl } from '../shared/CardCollapseControl'
import { useDomainCard } from './DomainCardContext'
export { DomainCardReorderControl } from './DomainCardReorderControl'
export { DomainCardSortControl } from './DomainCardSortControl'

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
