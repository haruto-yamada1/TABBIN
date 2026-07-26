import { describe, expect, it } from 'vitest' // eslint-disable-line

import * as lazyRecharts from './lazy-recharts'

const componentNames = [
  'Area',
  'AreaChart',
  'Bar',
  'BarChart',
  'CartesianGrid',
  'Line',
  'LineChart',
  'Pie',
  'PieChart',
  'PolarAngleAxis',
  'PolarGrid',
  'Radar',
  'RadarChart',
  'XAxis',
  'YAxis',
] as const

type LazyPayload = {
  _result: () => Promise<{ default: unknown }>
}

describe('lazy recharts exports', () => {
  it('すべての lazy export が recharts の対応コンポーネントを解決する', async () => {
    const lazyResults = componentNames.map(async (name) => {
      const component = lazyRecharts[name] as unknown as {
        _payload: LazyPayload
      }

      return component._payload._result()
    })

    await expect(Promise.all(lazyResults)).resolves.toStrictEqual(
      componentNames.map(() => ({
        default: expect.anything(),
      })),
    )
  })
})
