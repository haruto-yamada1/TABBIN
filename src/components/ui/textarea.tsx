import * as React from 'react'

import { cn } from '@/lib/utils'

const Textarea = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'textarea'>) => (
  <textarea
    className={cn(
      'flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:ring-destructive/40',
      className,
    )}
    ref={ref}
    {...props}
  />
)
Textarea.displayName = 'Textarea'

export { Textarea }
