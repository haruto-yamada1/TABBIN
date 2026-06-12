import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as React from 'react'

import { cn } from '@/lib/utils'

const Progress = ({
  className,
  ref,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) => {
  const FULL_PERCENT = 100

  const indicatorStyle = React.useMemo(
    () => ({ transform: `translateX(-${FULL_PERCENT - (value ?? 0)}%)` }),
    [value],
  )

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className='h-full w-full flex-1 bg-primary transition-all'
        style={indicatorStyle}
      />
    </ProgressPrimitive.Root>
  )
}
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
