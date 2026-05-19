import { ArrowUpDown, ArrowUpNarrowWide, ArrowUpWideNarrow } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import type { SortOrder } from '../../hooks/useSortOrder'
import { SavedTabsResponsiveTooltipContent } from './SavedTabsResponsive'

/** CardSortControl の props */
interface CardSortControlProps {
  /** 現在のソート順 */
  sortOrder: SortOrder
  /** ソート順を設定する関数 */
  setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>
  /** ポインターダウン時の追加ハンドラ */
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
}

/**
 * ソート順切り替えトグルボタン
 * default → asc → desc のサイクルで切り替わる
 * @param props CardSortControlProps
 */
export const CardSortControl = ({
  sortOrder,
  setSortOrder,
  onPointerDown,
}: CardSortControlProps) => {
  const { t } = useI18n()
  let label = t('savedTabs.sort.desc')
  if (sortOrder === 'default') {
    label = t('savedTabs.sort.default')
  } else if (sortOrder === 'asc') {
    label = t('savedTabs.sort.asc')
  }

  let icon = <ArrowUpWideNarrow size={14} />
  if (sortOrder === 'default') {
    icon = <ArrowUpDown size={14} />
  } else if (sortOrder === 'asc') {
    icon = <ArrowUpNarrowWide size={14} />
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='secondary'
          size='sm'
          onPointerDown={onPointerDown}
          onClick={(e) => {
            e.stopPropagation()
            setSortOrder((o) => {
              if (o === 'default') {
                return 'asc'
              }
              if (o === 'asc') {
                return 'desc'
              }
              return 'default'
            })
          }}
          className='flex cursor-pointer items-center gap-1'
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <SavedTabsResponsiveTooltipContent side='top'>
        {label}
      </SavedTabsResponsiveTooltipContent>
    </Tooltip>
  )
}
