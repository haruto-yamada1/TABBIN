import { CardFavoriteFilter } from '@/contexts/saved-tabs/presentation/components/shared/CardFavoriteFilter'
import { CardSortControl } from '@/contexts/saved-tabs/presentation/components/shared/CardSortControl'

import { useDomainCard } from './DomainCardContext'

/** DomainCard のソート順切り替えボタン */
export const DomainCardSortControl = () => {
  const { state, group, favoriteFilter } = useDomainCard()
  const { sort } = state

  return (
    <>
      <CardSortControl
        disabled={
          sort.isSortPending || state.categoryReorder.isCategoryReorderMode
        }
        sortOrder={sort.sortOrder}
        setSortOrder={sort.setSortOrder}
        targetName={group.domain}
      />
      {favoriteFilter &&
        (favoriteFilter.hasFavorites || favoriteFilter.only) && (
          <CardFavoriteFilter
            only={favoriteFilter.only}
            setOnly={favoriteFilter.setOnly}
            name={group.domain}
          />
        )}
    </>
  )
}
