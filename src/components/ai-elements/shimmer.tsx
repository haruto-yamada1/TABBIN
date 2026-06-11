'use client'

import { LazyMotion, domAnimation, m } from 'motion/react'
import type { CSSProperties, ElementType } from 'react'
import { memo, useMemo } from 'react'

import { cn } from '@/lib/utils'

export interface TextShimmerProps {
  children?: string
  as?: ElementType
  className?: string
  duration?: number
  spread?: number
}

const ShimmerComponent = ({
  children,
  as: Component = 'p',
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const MotionComponent = m.create(Component)

  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread],
  )

  return (
    <LazyMotion features={domAnimation}>
      <MotionComponent
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        animate={{ backgroundPosition: '0% center' }}
        className={cn(
          'relative inline-block bg-size-[250%_100%,auto] bg-clip-text text-transparent',
          '[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))]',
          className,
        )}
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        initial={{ backgroundPosition: '100% center' }}
        style={
          // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
          {
            '--spread': `${dynamicSpread}px`,
            backgroundImage:
              'var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))',
          } as CSSProperties
        }
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        transition={{
          duration,
          ease: 'linear',
          repeat: Number.POSITIVE_INFINITY,
        }}
      >
        {children ?? ''}
      </MotionComponent>
    </LazyMotion>
  )
}

export const Shimmer = memo(ShimmerComponent)
