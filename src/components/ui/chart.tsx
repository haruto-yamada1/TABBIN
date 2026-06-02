import * as React from 'react'

import { cn } from '@/lib/utils'

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { dark: '.dark', light: '' } as const

export interface ChartConfig {
  [key: string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

interface ChartContextProps {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

const RechartsResponsiveContainer = React.lazy(() =>
  import('recharts').then((module) => ({
    default: module.ResponsiveContainer,
  })),
)

const ChartTooltip = React.lazy(() =>
  import('recharts').then((module) => ({
    default: module.Tooltip,
  })),
)

const ChartLegend = React.lazy(() =>
  import('recharts').then((module) => ({
    default: module.Legend,
  })),
)

function useChart() {
  const context = React.use(ChartContext)

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }

  return context
}

const ChartContainer = ({
  children,
  className,
  config,
  id,
  ref,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  children: React.ReactNode
}) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [hasMeasuredSize, setHasMeasuredSize] = React.useState(false)

  React.useLayoutEffect(() => {
    const node = containerRef.current

    if (!node) {
      return
    }

    const updateHasMeasuredSize = (
      width = node.getBoundingClientRect().width,
      height = node.getBoundingClientRect().height,
    ) => {
      setHasMeasuredSize(width > 0 && height > 0)
    }

    updateHasMeasuredSize()

    if (typeof ResizeObserver === 'undefined') {
      const handleWindowResize = () => {
        updateHasMeasuredSize()
      }

      window.addEventListener('resize', handleWindowResize)

      return () => {
        window.removeEventListener('resize', handleWindowResize)
      }
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      updateHasMeasuredSize(
        entry?.contentRect.width,
        entry?.contentRect.height,
      )
    })

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={(node) => {
          containerRef.current = node

          if (typeof ref === 'function') {
            ref(node)
            return
          }

          if (ref) {
            ref.current = node
          }
        }}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {hasMeasuredSize ? (
          <React.Suspense fallback={null}>
            <RechartsResponsiveContainer
              height='100%'
              minWidth={0}
              width='100%'
            >
              {children}
            </RechartsResponsiveContainer>
          </React.Suspense>
        ) : null}
      </div>
    </ChartContext.Provider>
  )
}
ChartContainer.displayName = 'Chart'

const getChartStyleText = (id: string, config: ChartConfig) =>
  Object.entries(THEMES)
    .map(
      ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${Object.entries(config)
  .reduce<string[]>((items, [key, itemConfig]) => {
    if (!(itemConfig.theme || itemConfig.color)) {
      return items
    }
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color

    if (color) {
      items.push(`  --color-${key}: ${color};`)
    }
    return items
  }, [])
  .join('\n')}
}
`,
    )
    .join('\n')

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color,
  )

  if (!colorConfig.length) {
    return null
  }

  return <style>{getChartStyleText(id, Object.fromEntries(colorConfig))}</style>
}

type ChartTooltipContentProps = React.ComponentProps<'div'> &
  Partial<import('recharts').TooltipContentProps> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: 'line' | 'dot' | 'dashed'
    nameKey?: string
    labelKey?: string
  }

const renderTooltipIndicator = ({
  hideIndicator,
  indicator,
  indicatorColor,
  nestLabel,
}: {
  hideIndicator: boolean
  indicator: 'line' | 'dot' | 'dashed'
  indicatorColor?: string
  nestLabel: boolean
}) =>
  hideIndicator ? null : (
    <div
      className={cn(
        'shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]',
        {
          'my-0.5': nestLabel && indicator === 'dashed',
          'size-2.5': indicator === 'dot',
          'w-0 border-[1.5px] border-dashed bg-transparent':
            indicator === 'dashed',
          'w-1': indicator === 'line',
        },
      )}
      style={
        {
          '--color-bg': indicatorColor,
          '--color-border': indicatorColor,
        } as React.CSSProperties
      }
    />
  )

const renderTooltipRow = ({
  color,
  config,
  formatter,
  hideIndicator,
  indicator,
  item,
  index,
  nameKey,
  nestLabel,
  tooltipLabel,
}: {
  color?: string
  config: ChartConfig
  formatter?: ChartTooltipContentProps['formatter']
  hideIndicator: boolean
  indicator: 'line' | 'dot' | 'dashed'
  item: import('recharts').TooltipPayloadEntry
  index: number
  nameKey?: string
  nestLabel: boolean
  tooltipLabel: React.ReactNode
}) => {
  const key = `${nameKey || item.name || item.dataKey || 'value'}`
  const itemConfig = getPayloadConfigFromPayload(config, item, key)
  const indicatorColor = color || item.payload.fill || item.color

  return (
    <div
      key={String(item.dataKey ?? item.graphicalItemId ?? key)}
      className={cn(
        'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground',
        indicator === 'dot' && 'items-center',
      )}
    >
      {formatter && item?.value !== undefined && item.name ? (
        formatter(item.value, item.name, item, index, item.payload)
      ) : (
        <>
          {itemConfig?.icon ? (
            <itemConfig.icon />
          ) : (
            renderTooltipIndicator({
              hideIndicator,
              indicator,
              indicatorColor,
              nestLabel,
            })
          )}
          <div
            className={cn(
              'flex flex-1 justify-between leading-none',
              nestLabel ? 'items-end' : 'items-center',
            )}
          >
            <div className='grid gap-1.5'>
              {nestLabel ? tooltipLabel : null}
              <span className='text-muted-foreground'>
                {itemConfig?.label || item.name}
              </span>
            </div>
            {item.value !== undefined && item.value !== null && (
              <span className='font-mono font-medium tabular-nums text-foreground'>
                {item.value.toLocaleString()}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const ChartTooltipContent = ({
  active,
  className,
  color,
  formatter,
  hideIndicator = false,
  hideLabel = false,
  indicator = 'dot',
  label,
  labelClassName,
  labelFormatter,
  labelKey,
  nameKey,
  payload,
  ref,
}: ChartTooltipContentProps) => {
  const { config } = useChart()

  if (!active || !payload?.length) {
    return null
  }

  let tooltipLabel: React.ReactNode = null
  if (!hideLabel) {
    const [item] = payload
    const key = `${labelKey || item?.dataKey || item?.name || 'value'}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !labelKey && typeof label === 'string'
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label

    if (labelFormatter) {
      tooltipLabel = (
        <div className={cn('font-medium', labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      )
    } else if (value) {
      tooltipLabel = (
        <div className={cn('font-medium', labelClassName)}>{value}</div>
      )
    }
  }

  const nestLabel = payload.length === 1 && indicator !== 'dot'

  return (
    <div
      ref={ref}
      className={cn(
        'grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className='grid gap-1.5'>
        {payload.reduce<React.ReactNode[]>((items, item) => {
          if (item.type === 'none') {
            return items
          }
          items.push(
            renderTooltipRow({
              color,
              config,
              formatter,
              hideIndicator,
              index: items.length,
              indicator,
              item,
              nameKey,
              nestLabel,
              tooltipLabel,
            }),
          )
          return items
        }, [])}
      </div>
    </div>
  )
}
ChartTooltipContent.displayName = 'ChartTooltip'

const ChartLegendContent = ({
  className,
  hideIcon = false,
  nameKey,
  payload,
  ref,
  verticalAlign = 'bottom',
}: React.ComponentProps<'div'> &
  Partial<import('recharts').DefaultLegendContentProps> & {
    hideIcon?: boolean
    nameKey?: string
  }) => {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-center gap-4',
        verticalAlign === 'top' ? 'pb-3' : 'pt-3',
        className,
      )}
    >
      {payload.reduce<React.ReactNode[]>((items, item) => {
        if (item.type === 'none') {
          return items
        }
        const key = `${nameKey || item.dataKey || 'value'}`
        const itemConfig = getPayloadConfigFromPayload(config, item, key)
        const itemKey = String(item.dataKey ?? item.value ?? item.color)

        items.push(
          <div
            key={itemKey}
            className={cn(
              'flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground',
            )}
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className='size-2 shrink-0 rounded-[2px]'
                style={{
                  backgroundColor: item.color,
                }}
              />
            )}
            {itemConfig?.label}
          </div>,
        )
        return items
      }, [])}
    </div>
  )
}
ChartLegendContent.displayName = 'ChartLegend'

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }

  const payloadPayload =
    'payload' in payload &&
    typeof payload.payload === 'object' &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === 'string'
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === 'string'
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
}
