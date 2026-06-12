import type * as React from 'react'

import { TooltipContent } from '@/components/ui/tooltip'
import { useSavedTabsResponsiveLayout } from '@/features/saved-tabs/contexts/SavedTabsResponsiveLayoutContext'
import { cn } from '@/lib/utils'

type SavedTabsResponsiveTooltipContentProps = React.ComponentProps<
  typeof TooltipContent
>

const SavedTabsResponsiveTooltipContent = ({
  className,
  ...props
}: SavedTabsResponsiveTooltipContentProps) => {
  const { isCompactLayout } = useSavedTabsResponsiveLayout()

  return (
    <TooltipContent
      className={cn(isCompactLayout ? 'block' : 'hidden', className)}
      {...props}
    />
  )
}

const SavedTabsResponsiveLabel = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) => {
  const { isCompactLayout } = useSavedTabsResponsiveLayout()

  return (
    <span
      className={cn(isCompactLayout ? 'hidden' : 'inline', className)}
      {...props}
    />
  )
}

export { SavedTabsResponsiveLabel, SavedTabsResponsiveTooltipContent }
