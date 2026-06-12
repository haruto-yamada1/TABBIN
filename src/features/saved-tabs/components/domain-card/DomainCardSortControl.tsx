import { CardSortControl } from '../shared/CardSortControl'
import { useDomainCard } from './DomainCardContext'

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
