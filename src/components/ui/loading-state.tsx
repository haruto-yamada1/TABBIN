import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface LoadingStateProps {
  className?: string
  minHeightClassName?: string
  spinnerClassName?: string
}

function LoadingState({
  className,
  minHeightClassName = 'min-h-[200px]',
  spinnerClassName,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        minHeightClassName,
        className,
      )}
    >
      <Spinner className={cn('size-6', spinnerClassName)} />
    </div>
  )
}

export { LoadingState }
