import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiChartSpec } from '@/features/ai-chat/types'

const mocked = vi.hoisted(() => ({
  barProps: [] as Record<string, unknown>[],
  barChartProps: [] as Record<string, unknown>[],
  pieProps: [] as Record<string, unknown>[],
  tooltipProps: [] as Record<string, unknown>[],
}))

vi.mock('recharts', () => {
  const passthrough =
    (testId: string) =>
    ({ children }: { children?: React.ReactNode }) => (
      <div data-testid={testId}>{children}</div>
    )

  return {
    Area: passthrough('area'),
    AreaChart: passthrough('area-chart'),
    Bar: (props: Record<string, unknown>) => {
      mocked.barProps.push(props)

      return <div data-testid='bar' />
    },
    BarChart: (props: Record<string, unknown>) => {
      mocked.barChartProps.push(props)

      return (
        <div data-testid='bar-chart'>{props.children as React.ReactNode}</div>
      )
    },
    CartesianGrid: passthrough('cartesian-grid'),
// eslint-disable-next-line react/jsx-no-useless-fragment
    Cell: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Line: passthrough('line'),
    LineChart: passthrough('line-chart'),
    Pie: (props: Record<string, unknown>) => {
      mocked.pieProps.push(props)

      return <div data-testid='pie' />
    },
    PieChart: passthrough('pie-chart'),
    PolarAngleAxis: passthrough('polar-angle-axis'),
    PolarGrid: passthrough('polar-grid'),
    Radar: passthrough('radar'),
    RadarChart: passthrough('radar-chart'),
    XAxis: passthrough('x-axis'),
    YAxis: passthrough('y-axis'),
  }
})

vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({
    children,
    className,
  }: {
    children?: React.ReactNode
    className?: string
  }) => (
    <div className={className} data-testid='chart-container'>
      {children}
    </div>
  ),
  ChartLegend: ({ content }: { content?: React.ReactNode }) => (
    <div data-testid='chart-legend'>{content}</div>
  ),
  ChartLegendContent: () => <div data-testid='chart-legend-content' />,
  ChartTooltip: (props: Record<string, unknown>) => {
    mocked.tooltipProps.push(props)

    return (
      <div data-testid='chart-tooltip'>{props.children as React.ReactNode}</div>
    )
  },
  ChartTooltipContent: () => <div data-testid='chart-tooltip-content' />,
}))

import { AiChartRenderer } from './AiChartRenderer'

const PIE_SPEC: AiChartSpec = {
  categoryKey: 'label',
  data: [
    { count: 3, label: 'Frontend' },
    { count: 1, label: 'AI' },
  ],
  description: '最近保存したカテゴリ比率',
  series: [
    {
      colorToken: 'chart-1',
      dataKey: 'count',
      label: '保存数',
    },
  ],
  title: 'よく保存しているジャンル',
  type: 'pie',
  valueFormat: 'count',
}

describe('AiChartRenderer', () => {
  afterEach(() => {
    cleanup()
    mocked.barChartProps.length = 0
    mocked.barProps.length = 0
    mocked.pieProps.length = 0
    mocked.tooltipProps.length = 0
  })

  it('pie chart を描画する', async () => {
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AiChartRenderer charts={[PIE_SPEC]} />)

    await expect(screen.findByTestId('pie')).resolves.toBeTruthy()
    await expect(screen.findByTestId('chart-tooltip')).resolves.toBeTruthy()
    expect(mocked.pieProps[0]?.data).toStrictEqual([
      {
        count: 3,
        fill: 'var(--chart-1)',
        label: 'Frontend',
      },
      {
        count: 1,
        fill: 'var(--chart-2)',
        label: 'AI',
      },
    ])
    expect(mocked.pieProps[0]?.dataKey).toBe('count')
    expect(mocked.pieProps[0]?.nameKey).toBe('label')
    expect(mocked.tooltipProps[0]?.cursor).toBe(false)
  })

  it('bar chart を描画する', async () => {
    const barSpec: AiChartSpec = {
      data: [
        { count: 4, label: '動画' },
        { count: 2, label: '記事' },
      ],
      series: [
        {
          colorToken: 'chart-1',
          dataKey: 'count',
          label: '保存数',
        },
      ],
      title: 'ジャンル別の保存数',
      type: 'bar',
      valueFormat: 'count',
      xKey: 'label',
    }

// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
    render(<AiChartRenderer charts={[barSpec]} />)

    await expect(screen.findByTestId('bar-chart')).resolves.toBeTruthy()
    await expect(screen.findByTestId('chart-tooltip')).resolves.toBeTruthy()
    expect(mocked.barChartProps[0]?.data).toStrictEqual(barSpec.data)
    expect(screen.getByText('ジャンル別の保存数')).toBeTruthy()
  })

  it('グラフ要素クリックを通知する', async () => {
    const handleChartPointClick = vi.fn()
    const barSpec: AiChartSpec = {
      data: [
        { count: 4, label: '動画' },
        { count: 2, label: '記事' },
      ],
      series: [
        {
          colorToken: 'chart-1',
          dataKey: 'count',
          label: '保存数',
        },
      ],
      title: 'ジャンル別の保存数',
      type: 'bar',
      valueFormat: 'count',
      xKey: 'label',
    }

    render(
      <AiChartRenderer
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
        charts={[barSpec]}
        onChartPointClick={handleChartPointClick}
      />,
    )

    await waitFor(() => {
      expect(mocked.barProps[0]?.onClick).toBeTypeOf('function')
    })
    const onClick = mocked.barProps[0]?.onClick as (
      datum: Record<string, unknown>,
    ) => void

    onClick({
      count: 4,
      label: '動画',
    })

    expect(handleChartPointClick).toHaveBeenCalledWith({
      label: '動画',
      seriesKey: 'count',
      spec: barSpec,
      value: 4,
    })
  })

  it('ツールチップが出ている位置のチャートクリックでも通知する', () => {
    const handleChartPointClick = vi.fn()
    const barSpec: AiChartSpec = {
      data: [
        { count: 4, label: '動画' },
        { count: 2, label: '記事' },
      ],
      series: [
        {
          colorToken: 'chart-1',
          dataKey: 'count',
          label: '保存数',
        },
      ],
      title: 'ジャンル別の保存数',
      type: 'bar',
      valueFormat: 'count',
      xKey: 'label',
    }

    render(
      <AiChartRenderer
// eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
        charts={[barSpec]}
        onChartPointClick={handleChartPointClick}
      />,
    )

    const onClick = mocked.barChartProps[0]?.onClick as
      | ((
          state: Record<string, unknown>,
          event?: Record<string, unknown>,
        ) => void)
      | undefined

    onClick?.({
      activeDataKey: 'count',
      activeLabel: '動画',
      isTooltipActive: true,
    })

    expect(handleChartPointClick).toHaveBeenCalledWith({
      label: '動画',
      seriesKey: 'count',
      spec: barSpec,
      value: 4,
    })
  })
})
