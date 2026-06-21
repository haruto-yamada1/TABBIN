import { ArrowUpDown, ArrowUpNarrowWide, ArrowUpWideNarrow } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import type { SortOrder } from '@/contexts/saved-tabs/presentation/hooks/useSortOrder'
import { getScopedSortLabel } from '@/contexts/saved-tabs/presentation/lib/accessibility'
import { useI18n } from '@/features/i18n/context/I18nProvider'

import { SavedTabsResponsiveTooltipContent } from './SavedTabsResponsive'

/** CardSortControl の props */
interface CardSortControlProps {
  /** 現在のソート順 */
  sortOrder: SortOrder
  /** ソート順を設定する関数 */
  setSortOrder: React.Dispatch<React.SetStateAction<SortOrder>>
  /** アクセシブルネームに含める対象名 */
  targetName?: string
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
  targetName,
  onPointerDown,
}: CardSortControlProps) => {
  const { t } = useI18n()
  let sortLabel = t('savedTabs.sort.desc')
  if (sortOrder === 'default') {
    sortLabel = t('savedTabs.sort.default')
  } else if (sortOrder === 'asc') {
    sortLabel = t('savedTabs.sort.asc')
  }
  const label = getScopedSortLabel(t, targetName, sortLabel)

  let icon = <ArrowUpWideNarrow size={14} />
  if (sortOrder === 'default') {
    icon = <ArrowUpDown size={14} />
  } else if (sortOrder === 'asc') {
    icon = <ArrowUpNarrowWide size={14} />
  }

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [setSortOrder],
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='secondary'
          size='sm'
          onPointerDown={onPointerDown}
          onClick={handleClick}
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
