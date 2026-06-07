import { ExternalLink, Trash } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'

import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './SavedTabsResponsive'

interface CategoryBulkActionButtonsProps {
  isDeleting: boolean
  showDeleteAction: boolean
  openLabel: string
  openAriaLabel: string
  openTooltip: string
  deleteLabel: string
  deletingLabel: string
  deleteAriaLabel: string
  deleteTooltip: string
  onOpenAll: (event: React.MouseEvent) => void
  onDeleteAll: (event: React.MouseEvent) => void
}

export const CategoryBulkActionButtons = ({
  isDeleting,
  showDeleteAction,
  openLabel,
  openAriaLabel,
  openTooltip,
  deleteLabel,
  deletingLabel,
  deleteAriaLabel,
  deleteTooltip,
  onOpenAll,
  onDeleteAll,
}: CategoryBulkActionButtonsProps) => (
  <div className='flex items-center gap-2'>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='secondary'
          size='sm'
          onClick={onOpenAll}
          className='pointer-events-auto z-20 flex cursor-pointer items-center gap-1'
// eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
          style={{ position: 'relative' }}
          aria-label={openAriaLabel}
        >
          <ExternalLink size={14} />
          <SavedTabsResponsiveLabel>{openLabel}</SavedTabsResponsiveLabel>
        </Button>
      </TooltipTrigger>
      <SavedTabsResponsiveTooltipContent side='top'>
        {openTooltip}
      </SavedTabsResponsiveTooltipContent>
    </Tooltip>

    {showDeleteAction && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='secondary'
            size='sm'
            onClick={onDeleteAll}
            className='pointer-events-auto z-20 flex cursor-pointer items-center gap-1'
// eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
            style={{ position: 'relative' }}
            aria-label={deleteAriaLabel}
            disabled={isDeleting}
          >
            <Trash size={14} />
            <SavedTabsResponsiveLabel>
              {isDeleting ? deletingLabel : deleteLabel}
            </SavedTabsResponsiveLabel>
          </Button>
        </TooltipTrigger>
        <SavedTabsResponsiveTooltipContent side='top'>
          {deleteTooltip}
        </SavedTabsResponsiveTooltipContent>
      </Tooltip>
    )}
  </div>
)
