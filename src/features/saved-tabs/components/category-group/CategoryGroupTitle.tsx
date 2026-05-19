import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'

import { CardGroupTitle } from '../shared/CardGroupTitle'
import { SavedTabsResponsiveTooltipContent } from '../shared/SavedTabsResponsive'
import { useCategoryGroup } from './CategoryGroupContext'

/**
 * CategoryGroup のドラッグハンドル＆カテゴリ名表示
 * カテゴリ名、タブ数・ドメイン数バッジ、ドラッグハンドルを含む
 */
export const CategoryGroupTitle = () => {
  const { category, allUrls, visibleDomainsCount, sortable } =
    useCategoryGroup()

  const badges = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant='secondary'>{allUrls?.length ?? 0}</Badge>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          タブ数
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant='secondary'>{visibleDomainsCount}</Badge>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          ドメイン数
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>
    </>
  )

  return (
    <CardGroupTitle
      title={category.name}
      badges={badges}
      sortableAttributes={sortable.attributes}
      sortableListeners={sortable.listeners}
    />
  )
}
