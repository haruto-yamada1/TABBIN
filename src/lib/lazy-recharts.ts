import { lazy } from 'react'

export const Area = lazy(async () =>
  import('recharts').then((module) => ({ default: module.Area })),
)
export const AreaChart = lazy(async () =>
  import('recharts').then((module) => ({ default: module.AreaChart })),
)
export const Bar = lazy(async () =>
  import('recharts').then((module) => ({ default: module.Bar })),
)
export const BarChart = lazy(async () =>
  import('recharts').then((module) => ({ default: module.BarChart })),
)
export const CartesianGrid = lazy(async () =>
  import('recharts').then((module) => ({ default: module.CartesianGrid })),
)
export const Line = lazy(async () =>
  import('recharts').then((module) => ({ default: module.Line })),
)
export const LineChart = lazy(async () =>
  import('recharts').then((module) => ({ default: module.LineChart })),
)
export const Pie = lazy(async () =>
  import('recharts').then((module) => ({ default: module.Pie })),
)
export const PieChart = lazy(async () =>
  import('recharts').then((module) => ({ default: module.PieChart })),
)
export const PolarAngleAxis = lazy(async () =>
  import('recharts').then((module) => ({ default: module.PolarAngleAxis })),
)
export const PolarGrid = lazy(async () =>
  import('recharts').then((module) => ({ default: module.PolarGrid })),
)
export const Radar = lazy(async () =>
  import('recharts').then((module) => ({ default: module.Radar })),
)
export const RadarChart = lazy(async () =>
  import('recharts').then((module) => ({ default: module.RadarChart })),
)
export const XAxis = lazy(async () =>
  import('recharts').then((module) => ({ default: module.XAxis })),
)
export const YAxis = lazy(async () =>
  import('recharts').then((module) => ({ default: module.YAxis })),
)
