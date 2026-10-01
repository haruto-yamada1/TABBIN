import type { LucideIcon } from 'lucide-react'
import type { MouseEventHandler } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'

import {
  SavedTabsResponsiveLabel,
  SavedTabsResponsiveTooltipContent,
} from './SavedTabsResponsive'

type CardActionButtonProps = {
  icon: LucideIcon
  label: string
  accessibleLabel: string
  tooltip: string
  onClick: MouseEventHandler<HTMLButtonElement>
}

export const CardActionButton = ({
  icon: Icon,
  label,
  accessibleLabel,
  tooltip,
  onClick,
}: CardActionButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant='secondary'
        size='sm'
        onClick={onClick}
        className='flex cursor-pointer items-center gap-1'
        aria-label={accessibleLabel}
      >
        <Icon size={14} />
        <SavedTabsResponsiveLabel>{label}</SavedTabsResponsiveLabel>
      </Button>
    </TooltipTrigger>
    <SavedTabsResponsiveTooltipContent side='top'>
      {tooltip}
    </SavedTabsResponsiveTooltipContent>
  </Tooltip>
)
