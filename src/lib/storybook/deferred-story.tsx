import { Suspense, startTransition, useState } from 'react'
import type { LazyExoticComponent } from 'react'

import { Button } from '@/components/ui/button'

type DeferredStoryLoaderProps = {
  buttonLabel?: string
  component: LazyExoticComponent<() => React.JSX.Element>
  description: string
  title: string
}

const StoryFallback = () => (
  <div className='rounded-xl border bg-card p-6 text-sm text-muted-foreground'>
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
        <h2 className='text-lg font-semibold text-foreground'>{title}</h2>
        <p className='max-w-2xl text-sm text-muted-foreground'>{description}</p>
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
