import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = ({
  className,
  ref,
  type,
  ...props
}: React.ComponentProps<'input'>) => (
  <input
    type={type}
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:ring-destructive/40',
      className,
    )}
    ref={ref}
    {...props}
  />
)
Input.displayName = 'Input'

export { Input }
