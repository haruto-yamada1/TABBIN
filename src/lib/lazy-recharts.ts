/* V8 ignore start -- coverage-only lazy import wrappers. */
import { lazy } from 'react'

export const Area = lazy(() =>
  import('recharts').then((module) => ({ default: module.Area })),
)
export const AreaChart = lazy(() =>
  import('recharts').then((module) => ({ default: module.AreaChart })),
)
export const Bar = lazy(() =>
  import('recharts').then((module) => ({ default: module.Bar })),
)
export const BarChart = lazy(() =>
  import('recharts').then((module) => ({ default: module.BarChart })),
)
export const CartesianGrid = lazy(() =>
  import('recharts').then((module) => ({ default: module.CartesianGrid })),
)
export const Line = lazy(() =>
  import('recharts').then((module) => ({ default: module.Line })),
)
export const LineChart = lazy(() =>
  import('recharts').then((module) => ({ default: module.LineChart })),
)
export const Pie = lazy(() =>
  import('recharts').then((module) => ({ default: module.Pie })),
)
export const PieChart = lazy(() =>
  import('recharts').then((module) => ({ default: module.PieChart })),
)
export const PolarAngleAxis = lazy(() =>
  import('recharts').then((module) => ({ default: module.PolarAngleAxis })),
)
export const PolarGrid = lazy(() =>
  import('recharts').then((module) => ({ default: module.PolarGrid })),
)
export const Radar = lazy(() =>
  import('recharts').then((module) => ({ default: module.Radar })),
)
export const RadarChart = lazy(() =>
  import('recharts').then((module) => ({ default: module.RadarChart })),
)
export const XAxis = lazy(() =>
  import('recharts').then((module) => ({ default: module.XAxis })),
)
export const YAxis = lazy(() =>
  import('recharts').then((module) => ({ default: module.YAxis })),
)
