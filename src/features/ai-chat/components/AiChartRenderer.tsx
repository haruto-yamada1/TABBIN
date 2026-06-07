import type { ReactNode } from 'react'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import type { AiChartSeries, AiChartSpec } from '@/features/ai-chat/types'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  XAxis,
  YAxis,
} from '@/lib/lazy-recharts'

interface AiChartPointSelection {
  label: string
  seriesKey?: string
  spec: AiChartSpec
  value?: number
}

const PIE_CHART_COLOR_TOKENS = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
]

const getChartColor = (colorToken: string) => `var(--${colorToken})`

const createChartConfig = (series: AiChartSeries[]): ChartConfig =>
  Object.fromEntries(
    series.map((item) => [
      item.dataKey,
      {
        color: getChartColor(item.colorToken),
        label: item.label,
      },
    ]),
  )

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const hasValidSeries = (spec: AiChartSpec): boolean =>
  spec.series.length > 0 &&
  spec.series.every(
    (item) =>
      item &&
      typeof item.colorToken === 'string' &&
      item.colorToken.length > 0 &&
      typeof item.dataKey === 'string' &&
      item.dataKey.length > 0 &&
      typeof item.label === 'string' &&
      item.label.length > 0,
  )

const hasUsableData = (spec: AiChartSpec): boolean =>
  spec.data.some((datum) =>
    spec.series.some((series) => isFiniteNumber(datum[series.dataKey])),
  )

const isRenderableChartSpec = (spec: AiChartSpec): boolean =>
  typeof spec.title === 'string' &&
  spec.title.length > 0 &&
  Array.isArray(spec.data) &&
  hasValidSeries(spec) &&
  hasUsableData(spec)

const formatChartValue = (
  value: unknown,
  format?: AiChartSpec['valueFormat'],
) => {
  if (!isFiniteNumber(value)) {
    // eslint-disable-next-line typescript/no-base-to-string
    return String(value ?? '')
  }

  if (format === 'percent') {
    return `${Math.round(value)}%`
  }

  return value.toLocaleString()
}

const ChartLegendBlock = ({
  nameKey,
  shouldShowLegend,
}: {
  nameKey?: string
  shouldShowLegend: boolean
}) =>
  shouldShowLegend ? (
    // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
    <ChartLegend content={<ChartLegendContent nameKey={nameKey} />} />
  ) : null

const createChartPointClickHandler = ({
  onChartPointClick,
  series,
  spec,
}: {
  onChartPointClick?: (selection: AiChartPointSelection) => void
  series: AiChartSeries
  spec: AiChartSpec
}) => {
  if (!onChartPointClick) {
    return undefined
  }

  return (...args: unknown[]) => {
    const datum = args[0]
    if (!datum || typeof datum !== 'object') {
      return
    }

    const labelKey = spec.categoryKey || spec.xKey || 'label' // eslint-disable-line typescript/prefer-nullish-coalescing
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    const record = datum as Record<string, unknown>
    const labelValue = record[labelKey]
    const value = record[series.dataKey]

    if (typeof labelValue !== 'string') {
      return
    }

    onChartPointClick({
      label: labelValue,
      seriesKey: series.dataKey,
      spec,
      value: typeof value === 'number' ? value : undefined,
    })
  }
}

const createTooltipChartClickHandler = ({
  onChartPointClick,
  primarySeries,
  spec,
}: {
  onChartPointClick?: (selection: AiChartPointSelection) => void
  primarySeries: AiChartSeries
  spec: AiChartSpec
}) => {
  if (!onChartPointClick) {
    return undefined
  }

  return (state: {
    activeDataKey?: unknown
    activeLabel?: unknown
    isTooltipActive?: unknown
  }) => {
    if (state.isTooltipActive !== true) {
      return
    }

    const labelKey = spec.categoryKey || spec.xKey || 'label' // eslint-disable-line typescript/prefer-nullish-coalescing
    const { activeLabel } = state
    if (typeof activeLabel !== 'string' && typeof activeLabel !== 'number') {
      return
    }

    const label = String(activeLabel)
    const seriesKey =
      typeof state.activeDataKey === 'string'
        ? state.activeDataKey
        : primarySeries.dataKey
    const matchingDatum = spec.data.find(
      (datum) => String(datum[labelKey] ?? '') === label,
    )
    const value = matchingDatum?.[seriesKey]

    onChartPointClick({
      label,
      seriesKey,
      spec,
      value: typeof value === 'number' ? value : undefined,
    })
  }
}

const getPieChartData = (spec: AiChartSpec) =>
  spec.data.map((datum, index) => ({
    ...datum,
    fill: getChartColor(
      PIE_CHART_COLOR_TOKENS[index % PIE_CHART_COLOR_TOKENS.length],
    ),
  }))

const renderPieChart = ({
  categoryKey,
  onChartPointClick,
  primarySeries,
  shouldShowLegend,
  spec,
}: {
  categoryKey: string
  onChartPointClick?: (selection: AiChartPointSelection) => void
  primarySeries: AiChartSeries
  shouldShowLegend: boolean
  spec: AiChartSpec
}) => (
  <PieChart>
    <ChartTooltip
      content={
        // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
        <ChartTooltipContent
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          formatter={(value) => formatChartValue(value, spec.valueFormat)}
        />
      }
      cursor={false}
    />
    <Pie
      data={getPieChartData(spec)}
      dataKey={primarySeries.dataKey}
      nameKey={categoryKey}
      onClick={createChartPointClickHandler({
        onChartPointClick,
        series: primarySeries,
        spec,
      })}
      outerRadius={80}
    />
    <ChartLegendBlock
      nameKey={categoryKey}
      shouldShowLegend={shouldShowLegend}
    />
  </PieChart>
)

interface CartesianChartRenderProps {
  onChartPointClick?: (selection: AiChartPointSelection) => void
  primarySeries: AiChartSeries
  shouldShowLegend: boolean
  spec: AiChartSpec
}

interface CartesianChartContentProps {
  series: ReactNode
  shouldShowLegend: boolean
  spec: AiChartSpec
}

const CartesianChartContent = ({
  series,
  shouldShowLegend,
  spec,
}: CartesianChartContentProps) => (
  <>
    <CartesianGrid vertical={false} />
    <XAxis axisLine={false} dataKey={spec.xKey} tickLine={false} />
    <YAxis axisLine={false} tickLine={false} />
    <ChartTooltip
      content={
        // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
        <ChartTooltipContent
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          formatter={(value) => formatChartValue(value, spec.valueFormat)}
        />
      }
      cursor={false}
    />
    <ChartLegendBlock shouldShowLegend={shouldShowLegend} />
    {series}
  </>
)

const renderBarChart = (props: CartesianChartRenderProps) =>
  props.spec.xKey ? (
    <BarChart
      accessibilityLayer
      data={props.spec.data}
      onClick={createTooltipChartClickHandler({
        onChartPointClick: props.onChartPointClick,
        primarySeries: props.primarySeries,
        spec: props.spec,
      })}
    >
      <CartesianChartContent
        // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
        series={props.spec.series.map((series) => (
          <Bar
            dataKey={series.dataKey}
            fill={getChartColor(series.colorToken)}
            key={series.dataKey}
            onClick={createChartPointClickHandler({
              onChartPointClick: props.onChartPointClick,
              series,
              spec: props.spec,
            })}
            radius={6}
            stackId={props.spec.stacked ? 'stack' : undefined}
          />
        ))}
        shouldShowLegend={props.shouldShowLegend}
        spec={props.spec}
      />
    </BarChart>
  ) : null

const renderLineChart = (props: CartesianChartRenderProps) =>
  props.spec.xKey ? (
    <LineChart
      accessibilityLayer
      data={props.spec.data}
      onClick={createTooltipChartClickHandler({
        onChartPointClick: props.onChartPointClick,
        primarySeries: props.primarySeries,
        spec: props.spec,
      })}
    >
      <CartesianChartContent
        // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
        series={props.spec.series.map((series) => (
          <Line
            dataKey={series.dataKey}
            dot={false}
            key={series.dataKey}
            stroke={getChartColor(series.colorToken)}
            strokeWidth={2}
            type='monotone'
          />
        ))}
        shouldShowLegend={props.shouldShowLegend}
        spec={props.spec}
      />
    </LineChart>
  ) : null

const renderAreaChart = (props: CartesianChartRenderProps) =>
  props.spec.xKey ? (
    <AreaChart
      accessibilityLayer
      data={props.spec.data}
      onClick={createTooltipChartClickHandler({
        onChartPointClick: props.onChartPointClick,
        primarySeries: props.primarySeries,
        spec: props.spec,
      })}
    >
      <CartesianChartContent
        // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
        series={props.spec.series.map((series) => (
          <Area
            dataKey={series.dataKey}
            fill={getChartColor(series.colorToken)}
            fillOpacity={0.3}
            key={series.dataKey}
            stackId={props.spec.stacked ? 'stack' : undefined}
            stroke={getChartColor(series.colorToken)}
            strokeWidth={2}
            type='monotone'
          />
        ))}
        shouldShowLegend={props.shouldShowLegend}
        spec={props.spec}
      />
    </AreaChart>
  ) : null

const renderRadarChart = ({
  categoryKey,
  onChartPointClick,
  primarySeries,
  shouldShowLegend,
  spec,
}: {
  categoryKey: string
  onChartPointClick?: (selection: AiChartPointSelection) => void
  primarySeries: AiChartSeries
  shouldShowLegend: boolean
  spec: AiChartSpec
}) => (
  <RadarChart
    accessibilityLayer
    data={spec.data}
    onClick={createTooltipChartClickHandler({
      onChartPointClick,
      primarySeries,
      spec,
    })}
  >
    <ChartTooltip
      content={
        // eslint-disable-next-line react-perf/jsx-no-jsx-as-prop
        <ChartTooltipContent
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          formatter={(value) => formatChartValue(value, spec.valueFormat)}
        />
      }
      cursor={false}
    />
    <ChartLegendBlock shouldShowLegend={shouldShowLegend} />
    <PolarGrid />
    <PolarAngleAxis dataKey={categoryKey} />
    {spec.series.map((series) => (
      <Radar
        dataKey={series.dataKey}
        fill={getChartColor(series.colorToken)}
        fillOpacity={0.25}
        key={series.dataKey}
        stroke={getChartColor(series.colorToken)}
      />
    ))}
  </RadarChart>
)

const renderChartContent = ({
  categoryKey,
  onChartPointClick,
  primarySeries,
  shouldShowLegend,
  spec,
}: {
  categoryKey: string
  onChartPointClick?: (selection: AiChartPointSelection) => void
  primarySeries: AiChartSeries
  shouldShowLegend: boolean
  spec: AiChartSpec
}) => {
  switch (spec.type) {
    case 'pie': {
      return renderPieChart({
        categoryKey,
        onChartPointClick,
        primarySeries,
        shouldShowLegend,
        spec,
      })
    }
    case 'bar': {
      return renderBarChart({
        onChartPointClick,
        primarySeries,
        shouldShowLegend,
        spec,
      })
    }
    case 'line': {
      return renderLineChart({
        onChartPointClick,
        primarySeries,
        shouldShowLegend,
        spec,
      })
    }
    case 'area': {
      return renderAreaChart({
        onChartPointClick,
        primarySeries,
        shouldShowLegend,
        spec,
      })
    }
    case 'radar': {
      return renderRadarChart({
        categoryKey,
        onChartPointClick,
        primarySeries,
        shouldShowLegend,
        spec,
      })
    }
    default: {
      return null
    }
  }
}

const AiChart = ({
  onChartPointClick,
  spec,
}: {
  onChartPointClick?: (selection: AiChartPointSelection) => void
  spec: AiChartSpec
}) => {
  const config = createChartConfig(spec.series)
  const primarySeries = spec.series[0]
  const categoryKey = spec.categoryKey || spec.xKey || 'label' // eslint-disable-line typescript/prefer-nullish-coalescing
  const shouldShowLegend = spec.showLegend ?? spec.series.length > 1
  const chartContent = renderChartContent({
    categoryKey,
    onChartPointClick,
    primarySeries,
    shouldShowLegend,
    spec,
  })

  if (!chartContent) {
    return null
  }

  return (
    <section className='space-y-3 rounded-lg border border-border/70 bg-background/70 p-3'>
      <div className='space-y-1'>
        <h3 className='text-sm font-medium'>{spec.title}</h3>
        {spec.description ? (
          <p className='text-xs text-muted-foreground'>{spec.description}</p>
        ) : null}
      </div>

      <div className='relative h-60 w-full overflow-visible'>
        <ChartContainer
          className='aspect-auto h-full w-full overflow-visible'
          config={config}
        >
          {chartContent}
        </ChartContainer>
      </div>
    </section>
  )
}

const AiChartRenderer = ({
  charts,
  onChartPointClick,
}: {
  charts?: AiChartSpec[]
  onChartPointClick?: (selection: AiChartPointSelection) => void
}) => {
  const renderableCharts = (charts ?? []).filter(isRenderableChartSpec)

  if (renderableCharts.length === 0) {
    return null
  }

  return (
    <div className='space-y-3 pt-3'>
      {renderableCharts.map((spec) => (
        <AiChart
          key={`${spec.type}-${spec.title}`}
          onChartPointClick={onChartPointClick}
          spec={spec}
        />
      ))}
    </div>
  )
}

export type { AiChartPointSelection }
export { AiChartRenderer }
