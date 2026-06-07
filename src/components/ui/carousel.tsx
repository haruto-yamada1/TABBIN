import useEmblaCarousel from 'embla-carousel-react'
import type { UseEmblaCarouselType } from 'embla-carousel-react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useI18nText } from '@/features/i18n/lib/useI18nText'
import { cn } from '@/lib/utils'

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

interface CarouselProps {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: 'horizontal' | 'vertical'
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = React.use(CarouselContext)

  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />')
  }

  return context
}

const Carousel = ({
  children,
  className,
  opts,
  orientation = 'horizontal',
  plugins,
  ref,
  ...props
}: React.ComponentProps<'div'> & CarouselProps) => {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === 'horizontal' ? 'x' : 'y',
    },
    plugins,
  )
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) {
      return
    }

    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }, [])
  const onSelectRef = React.useRef(onSelect)

  React.useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev()
  }, [api])

  const scrollNext = React.useCallback(() => {
    api?.scrollNext()
  }, [api])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        scrollPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        scrollNext()
      }
    },
    [scrollPrev, scrollNext],
  )

  React.useEffect(() => {
    if (!api) {
      return
    }

    const handleSelect = (selectedApi: CarouselApi) => {
      onSelectRef.current(selectedApi)
    }

    handleSelect(api)
    api.on('reInit', handleSelect)
    api.on('select', handleSelect)

    // eslint-disable-next-line typescript/consistent-return
    return () => {
      api.off('reInit', handleSelect)
      api.off('select', handleSelect)
    }
  }, [api])

  const contextValue = React.useMemo(
    () => ({
      api,
      canScrollNext,
      canScrollPrev,
      carouselRef,
      opts,
      orientation:
        orientation || (opts?.axis === 'y' ? 'vertical' : 'horizontal'),
      scrollNext,
      scrollPrev,
    }),
    [
      api,
      canScrollNext,
      canScrollPrev,
      carouselRef,
      opts,
      orientation,
      scrollNext,
      scrollPrev,
    ],
  )

  return (
    <CarouselContext.Provider value={contextValue}>
      <div
        ref={ref}
        onKeyDownCapture={handleKeyDown}
        className={cn('relative', className)}
        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
        role='region'
        aria-roledescription='carousel'
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  )
}
Carousel.displayName = 'Carousel'

const CarouselContent = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => {
  const { carouselRef, orientation } = useCarousel()

  return (
    <div ref={carouselRef} className='overflow-hidden'>
      <div
        ref={ref}
        className={cn(
          'flex',
          orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col',
          className,
        )}
        {...props}
      />
    </div>
  )
}
CarouselContent.displayName = 'CarouselContent'

const CarouselItem = ({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'>) => {
  const { orientation } = useCarousel()

  return (
    <div
      ref={ref}
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
      role='group'
      aria-roledescription='slide'
      className={cn(
        'min-w-0 shrink-0 grow-0 basis-full',
        orientation === 'horizontal' ? 'pl-4' : 'pt-4',
        className,
      )}
      {...props}
    />
  )
}
CarouselItem.displayName = 'CarouselItem'

const CarouselPrevious = ({
  className,
  ref,
  size = 'icon',
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof Button>) => {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel()
  const t = useI18nText()

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        'absolute size-8 rounded-full',
        orientation === 'horizontal'
          ? 'top-1/2 -left-12 -translate-y-1/2'
          : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ArrowLeft className='size-4' />
      <span className='sr-only'>{t('common.previousSlide')}</span>
    </Button>
  )
}
CarouselPrevious.displayName = 'CarouselPrevious'

const CarouselNext = ({
  className,
  ref,
  size = 'icon',
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof Button>) => {
  const { orientation, scrollNext, canScrollNext } = useCarousel()
  const t = useI18nText()

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn(
        'absolute size-8 rounded-full',
        orientation === 'horizontal'
          ? 'top-1/2 -right-12 -translate-y-1/2'
          : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ArrowRight className='size-4' />
      <span className='sr-only'>{t('common.nextSlide')}</span>
    </Button>
  )
}
CarouselNext.displayName = 'CarouselNext'

export {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
}
