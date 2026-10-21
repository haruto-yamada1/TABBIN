import { CardSortControl } from '@/contexts/saved-tabs/presentation/components/shared/CardSortControl'

import { useDomainCard } from './DomainCardContext'

/** DomainCard のソート順切り替えボタン */
export const DomainCardSortControl = () => {
  const { state, group } = useDomainCard()
  const { sort } = state

  return (
    <CardSortControl
      disabled={
        sort.isSortPending || state.categoryReorder.isCategoryReorderMode
      }
      sortOrder={sort.sortOrder}
      setSortOrder={sort.setSortOrder}
      targetName={group.domain}
    />
  )
}
