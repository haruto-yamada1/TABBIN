import { CardSortControl } from '@/contexts/saved-tabs/presentation/components/shared/CardSortControl'

import { useCategoryGroup } from './CategoryGroupContext'

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
