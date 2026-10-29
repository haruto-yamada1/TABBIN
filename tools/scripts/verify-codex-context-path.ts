import { z } from 'zod'

const statsSchema = z.object({
  summary: z.object({
    mode: z.literal('cache'),
    primary_model: z.string(),
  }),
  requests: z.object({
    total: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
})

export type ContextPathSnapshot = {
  requests: number
  failed: number
  model: string
}

export function parseContextPathStats(value: unknown): ContextPathSnapshot {
  const parsed = statsSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error('Headroom cache-mode counters are unavailable or invalid')
  }
  return {
    requests: parsed.data.requests.total,
    failed: parsed.data.requests.failed,
    model: parsed.data.summary.primary_model,
  }
}

export function contextPathStatsUrl(value: string): URL {
  const url = new URL(value)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Use a dedicated http://127.0.0.1:<port> proxy')
  }
  url.pathname = '/stats'
  return url
}

export function verifyContextPath(
  before: Pick<ContextPathSnapshot, 'requests' | 'failed'>,
  after: ContextPathSnapshot,
  expectedModel: string,
): void {
  if (
    !Number.isSafeInteger(before.requests) ||
    !Number.isSafeInteger(before.failed) ||
    before.requests < 0 ||
    before.failed < 0
  ) {
    throw new Error('Invalid baseline counters')
  }
  if (after.requests <= before.requests) {
    throw new Error('No measured proxy request: a Codex reply is insufficient')
  }
  if (after.failed !== before.failed) {
    throw new Error('Proxy failures increased or counters were reset')
  }
  if (!expectedModel || after.model !== expectedModel) {
    throw new Error('Measured model differs from the expected model')
  }
}

function parseCounterArgument(value: string | undefined): number {
  const counter = /^\d+$/u.test(value ?? '') ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new Error('Invalid baseline counters')
  }
  return counter
}

export async function main(args: string[]): Promise<void> {
  const [proxy, ...verification] = args
  if (!proxy || ![0, 3].includes(verification.length)) {
    throw new Error(
      'Usage: bun tools/scripts/verify-codex-context-path.ts <proxy> [requests-before failed-before model]',
    )
  }
  const before = verification.length
    ? {
        requests: parseCounterArgument(verification[0]),
        failed: parseCounterArgument(verification[1]),
      }
    : null
  const response = await fetch(contextPathStatsUrl(proxy), {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) {
    throw new Error('Headroom statistics endpoint failed')
  }
  const snapshot = parseContextPathStats(await response.json())
  if (before) {
    verifyContextPath(before, snapshot, verification[2] ?? '')
  }
  console.log(
    JSON.stringify({ ...snapshot, verified: Boolean(verification.length) }),
  )
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2))
  } catch {
    // Do not expose server bodies, URLs, headers, or credentials in diagnostics.
    console.error(
      'Context path verification failed; check arguments and proxy counters',
    )
    process.exitCode = 1
  }
}
