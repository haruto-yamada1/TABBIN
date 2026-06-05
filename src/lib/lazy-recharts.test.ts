import { describe, expect, it } from 'vitest'

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
    for (const name of componentNames) {
      const component = lazyRecharts[name] as unknown as {
        _payload: LazyPayload
      }

      await expect(component._payload._result()).resolves.toEqual({
        default: expect.anything(),
      })
    }
  })
})
