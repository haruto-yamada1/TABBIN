import * as React from 'react'

import { cn } from '@/lib/utils'

const Card = ({ className, ref, ...props }: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl border bg-card text-card-foreground shadow',
      className,
    )}
    {...props}
  />
)
Card.displayName = 'Card'

const CardHeader = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div ref={ref} className={cn('flex flex-col', className)} {...props} />
)
CardHeader.displayName = 'CardHeader'

const CardTitle = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    className={cn('font-semibold leading-none tracking-tight', className)}
    {...props}
  />
)
CardTitle.displayName = 'CardTitle'

const CardDescription = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
)
CardDescription.displayName = 'CardDescription'

const CardAction = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    className={cn(
      'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
      className,
    )}
    {...props}
  />
)
CardAction.displayName = 'CardAction'

const CardContent = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div ref={ref} className={cn('pt-0', className)} {...props} />
)
CardContent.displayName = 'CardContent'

const CardFooter = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => (
  <div
    ref={ref}
    className={cn('flex items-center pt-0', className)}
    {...props}
  />
)
CardFooter.displayName = 'CardFooter'

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
}
