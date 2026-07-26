import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type SavedTabsChatHeaderTooltipButtonProps = {
  ariaLabel: string
  children: ReactNode
  dataState?: 'copied' | 'idle'
  disabled?: boolean
  onClick: () => void
  tooltipText: string
}

export const SavedTabsChatHeaderTooltipButton = ({
  ariaLabel,
  children,
  dataState,
  disabled,
  onClick,
  tooltipText,
}: SavedTabsChatHeaderTooltipButtonProps) => (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={ariaLabel}
          data-state={dataState}
          disabled={disabled}
          onClick={onClick}
          size='icon'
          type='button'
          variant='ghost'
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side='bottom'>{tooltipText}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)
