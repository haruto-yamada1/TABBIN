import { GripVertical } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'

import { SavedTabsResponsiveTooltipContent } from '../shared/SavedTabsResponsive'
import { useDomainCard } from './DomainCardContext'

/**
 * DomainCard のドラッグハンドル＆ドメイン名表示
 * ドメイン名、タブ数バッジ、ドラッグハンドルを含む
 */
export const DomainCardTitle = () => {
  const { group, sortable, categoryId, visibleSubCategoryCount } =
    useDomainCard()

  return (
    <div
      className='flex grow cursor-grab items-center gap-2 overflow-hidden hover:cursor-grab active:cursor-grabbing'
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <div className='shrink-0 text-muted-foreground'>
        <GripVertical size={16} aria-hidden='true' />
      </div>
      <h2 className='truncate text-lg font-semibold text-foreground'>
        {group.domain}
      </h2>
      <span className='text-sm text-muted-foreground'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant='secondary'>{group.urls?.length || 0}</Badge>
          </TooltipTrigger>
          <SavedTabsResponsiveTooltipContent side='top'>
            タブ数
          </SavedTabsResponsiveTooltipContent>
        </Tooltip>
      </span>
      {categoryId ? (
        <span className='text-sm text-muted-foreground'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant='secondary'>{visibleSubCategoryCount}</Badge>
            </TooltipTrigger>
            <SavedTabsResponsiveTooltipContent side='top'>
              子カテゴリ数
            </SavedTabsResponsiveTooltipContent>
          </Tooltip>
        </span>
      ) : null}
    </div>
  )
}
