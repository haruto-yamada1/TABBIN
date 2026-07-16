'use client'

/* eslint-disable react-hooks-compiler/static-components -- vendored framer-motion pattern: m.create(Component) animates the dynamic element type passed via the `as` prop and cannot be hoisted to module scope */
import { LazyMotion, domAnimation, m } from 'motion/react'
import type { CSSProperties, ElementType } from 'react'
import { memo, useMemo } from 'react'

import { cn } from '@/lib/utils'

export type TextShimmerProps = {
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
  const MotionComponent = useMemo(() => m.create(Component), [Component])

  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread],
  )

  const shimmerStyle: CSSProperties & Record<`--${string}`, string> = {
    '--spread': `${dynamicSpread}px`,
    backgroundImage:
      'var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))',
  }

  return (
    <LazyMotion features={domAnimation}>
      <MotionComponent
        animate={{ backgroundPosition: '0% center' }}
        className={cn(
          'relative inline-block bg-size-[250%_100%,auto] bg-clip-text text-transparent',
          '[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))]',
          className,
        )}
        initial={{ backgroundPosition: '100% center' }}
        style={shimmerStyle}
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
