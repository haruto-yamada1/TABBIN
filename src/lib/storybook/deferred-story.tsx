import { Suspense, startTransition, useState } from 'react'
import type { LazyExoticComponent } from 'react'

import { Button } from '@/components/ui/button'

interface DeferredStoryLoaderProps {
  buttonLabel?: string
  component: LazyExoticComponent<() => React.JSX.Element>
  description: string
  title: string
}

const StoryFallback = () => (
  <div className='rounded-xl border bg-card p-6 text-muted-foreground text-sm'>
    Loading story…
  </div>
)

export const DeferredStoryLoader = ({
  buttonLabel = 'Load story',
  component: StoryComponent,
  description,
  title,
}: DeferredStoryLoaderProps) => {
  const [isLoaded, setIsLoaded] = useState(false)

  return isLoaded ? (
    <Suspense fallback={<StoryFallback />}>
      <StoryComponent />
    </Suspense>
  ) : (
    <div className='gap-y-4 rounded-xl border bg-card p-6'>
      <div className='gap-y-2'>
        <h2 className='font-semibold text-foreground text-lg'>{title}</h2>
        <p className='max-w-2xl text-muted-foreground text-sm'>{description}</p>
      </div>
      <Button
        onClick={() => {
          startTransition(() => {
            setIsLoaded(true)
          })
        }}
        type='button'
      >
        {buttonLabel}
      </Button>
    </div>
  )
}
