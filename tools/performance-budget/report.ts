export type BudgetSample = {
  scenario: 'initial' | 'search' | 'category-switch' | 'bulk-open'
  size: 1000 | 10000
  mode: 'domain' | 'custom' | 'backgroundTabs'
  repeat: number
  durationMs: number
  work: Record<string, number>
}

export type BudgetEnvironment = {
  platform: string
  browserVersion: string
  nodeVersion: string
  bunVersion: string
}

type CaseDefinition = Pick<BudgetSample, 'scenario' | 'size' | 'mode'> & {
  id: string
}

export type BudgetCase = CaseDefinition & {
  count: number
  durationMs: { median: number; p95: number }
  work: Record<string, number>
}

export type BudgetFailure = {
  code: 'input' | 'matrix' | 'budget' | 'baseline'
  message: string
  caseId?: string
  metric?: string
  actual?: number
  expected?: number
  repeat?: number
}

export type BudgetEvaluation = {
  sampleCount: number
  repeatCount: number
  cases: BudgetCase[]
  failures: BudgetFailure[]
}

export const REQUIRED_CASES: readonly CaseDefinition[] = [
  ...(['initial', 'search', 'category-switch'] as const).flatMap((scenario) =>
    ([1000, 10000] as const).flatMap((size) =>
      (['domain', 'custom'] as const).map((mode) => ({
        id: `${scenario}/${size}/${mode}`,
        scenario,
        size,
        mode,
      })),
    ),
  ),
  ...([1000, 10000] as const).map((size) => ({
    id: `bulk-open/${size}/backgroundTabs`,
    scenario: 'bulk-open' as const,
    size,
    mode: 'backgroundTabs' as const,
  })),
]

const pageBudgets = {
  domain: {
    readonlyTransactions: 12,
    sessionCalls: 12,
    pageQueries: 2,
    pendingOperations: 0,
  },
  custom: {
    readonlyTransactions: 37,
    sessionCalls: 37,
    pageQueries: 2,
    pendingOperations: 0,
  },
} as const

/** Work counts are the gate; wall-clock observations are advisory only. */
export const WORK_BUDGETS = {
  initial: pageBudgets,
  // Navigating to the next parent category / project uses the loaded snapshot.
  'category-switch': {
    domain: {
      readonlyTransactions: 0,
      sessionCalls: 0,
      pageQueries: 0,
      pendingOperations: 0,
    },
    custom: {
      readonlyTransactions: 0,
      sessionCalls: 0,
      pageQueries: 0,
      pendingOperations: 0,
    },
  },
  search: {
    domain: { readonlyTransactions: 1 },
    custom: { readonlyTransactions: 6 },
  },
  'bulk-open': {
    backgroundTabs: {
      peakPendingCreates: 5,
      createdTabs: 'size',
      opened: 'size',
      failed: 0,
      remaining: 'size',
      pendingOperations: 0,
    },
  },
} as const

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function isEnvironment(value: unknown): value is BudgetEnvironment {
  return (
    isRecord(value) &&
    ['platform', 'browserVersion', 'nodeVersion', 'bunVersion'].every(
      (key) => typeof value[key] === 'string' && value[key].trim().length > 0,
    )
  )
}

export function requiredWork(
  sample: Pick<BudgetSample, 'scenario' | 'mode'>,
): Record<string, number | 'size'> {
  if (sample.scenario === 'bulk-open') {
    return WORK_BUDGETS['bulk-open'].backgroundTabs
  }
  const mode = sample.mode === 'domain' ? 'domain' : 'custom'
  return WORK_BUDGETS[sample.scenario][mode]
}

export function isWorkCounts(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isCount)
}

function sampleDefinition(value: Record<string, unknown>) {
  return REQUIRED_CASES.find(
    ({ scenario, size, mode }) =>
      value.scenario === scenario && value.size === size && value.mode === mode,
  )
}

function parseSample(value: unknown, index: number): BudgetSample | string {
  if (!isRecord(value)) {
    return `Sample ${index} must be an object.`
  }
  const definition = sampleDefinition(value)
  if (!definition) {
    return `Sample ${index} has an unsupported case.`
  }
  if (!isCount(value.repeat)) {
    return `Sample ${index} has an invalid repeat.`
  }
  if (!isDuration(value.durationMs)) {
    return `Sample ${index} has an invalid durationMs.`
  }
  const work = value.work
  if (
    !isWorkCounts(work) ||
    !Object.keys(requiredWork(definition)).every((key) =>
      Object.hasOwn(work, key),
    )
  ) {
    return `Sample ${index} has invalid or missing work counts.`
  }
  return {
    scenario: definition.scenario,
    size: definition.size,
    mode: definition.mode,
    repeat: value.repeat,
    durationMs: value.durationMs,
    work,
  }
}

function budgetFailures(sample: BudgetSample): BudgetFailure[] {
  const caseId = `${sample.scenario}/${sample.size}/${sample.mode}`
  return Object.entries(requiredWork(sample)).flatMap(([metric, limit]) => {
    const actual = sample.work[metric] ?? 0
    const expected = limit === 'size' ? sample.size : limit
    const equality =
      sample.scenario === 'bulk-open' && metric !== 'peakPendingCreates'
    if (equality ? actual === expected : actual <= expected) {
      return []
    }
    return [
      {
        code: 'budget' as const,
        message: `${caseId}: ${metric} must be ${equality ? '=' : '<='} ${expected}; observed ${actual}.`,
        caseId,
        metric,
        actual,
        expected,
        repeat: sample.repeat,
      },
    ]
  })
}

function aggregateCase(
  definition: CaseDefinition,
  samples: BudgetSample[],
): BudgetCase {
  const duration = samples
    .map(({ durationMs }) => durationMs)
    .toSorted((a, b) => a - b)
  const middle = Math.floor(duration.length / 2)
  const work: Record<string, number> = {}
  for (const sample of samples) {
    for (const [key, count] of Object.entries(sample.work)) {
      const previous = Object.hasOwn(work, key) ? (work[key] ?? 0) : 0
      Object.defineProperty(work, key, {
        value: Math.max(previous, count),
        enumerable: true,
        configurable: true,
      })
    }
  }
  return {
    ...definition,
    count: samples.length,
    durationMs: {
      median:
        duration.length % 2 === 1
          ? (duration[middle] ?? 0)
          : (duration[middle - 1] ?? 0) / 2 + (duration[middle] ?? 0) / 2,
      p95: duration[Math.ceil(duration.length * 0.95) - 1] ?? 0,
    },
    work,
  }
}

export function evaluateSamples(input: unknown): BudgetEvaluation {
  const result: BudgetEvaluation = {
    sampleCount: 0,
    repeatCount: 0,
    cases: [],
    failures: [],
  }
  if (!Array.isArray(input) || input.length === 0) {
    result.failures.push({
      code: 'input',
      message: 'At least one complete matrix of samples is required.',
    })
    return result
  }
  const groups = new Map<string, BudgetSample[]>()
  for (const [index, value] of input.entries()) {
    const sample = parseSample(value, index)
    if (typeof sample === 'string') {
      result.failures.push({ code: 'input', message: sample })
      continue
    }
    result.sampleCount += 1
    const id = `${sample.scenario}/${sample.size}/${sample.mode}`
    const group = groups.get(id) ?? []
    group.push(sample)
    groups.set(id, group)
    result.failures.push(...budgetFailures(sample))
  }
  for (const definition of REQUIRED_CASES) {
    const samples = groups.get(definition.id) ?? []
    if (samples.length === 0) {
      result.failures.push({
        code: 'matrix',
        message: `Missing required case ${definition.id}.`,
        caseId: definition.id,
      })
      continue
    }
    const repeats = samples
      .map(({ repeat }) => repeat)
      .toSorted((a, b) => a - b)
    if (repeats.some((repeat, index) => repeat !== index)) {
      result.failures.push({
        code: 'matrix',
        message: `${definition.id}: repeats must be unique and contiguous from 0.`,
        caseId: definition.id,
      })
    }
    result.cases.push(aggregateCase(definition, samples))
  }
  const counts = new Set(result.cases.map(({ count }) => count))
  if (counts.size > 1) {
    result.failures.push({
      code: 'matrix',
      message: 'Every required case must have the same repeat count.',
    })
  }
  result.repeatCount = counts.size === 1 ? ([...counts][0] ?? 0) : 0
  return result
}
