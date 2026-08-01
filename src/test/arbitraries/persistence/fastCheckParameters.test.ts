import { afterEach, describe, expect, it, vi } from 'vitest'

const importParameters = async (env: { runs?: string; seed?: string }) => {
  vi.resetModules()
  vi.unstubAllEnvs()
  // Start each import without values inherited from the outer environment.
  vi.stubEnv('FAST_CHECK_RUNS', undefined)
  vi.stubEnv('FAST_CHECK_SEED', undefined)
  if (env.runs !== undefined) {
    vi.stubEnv('FAST_CHECK_RUNS', env.runs)
  }
  if (env.seed !== undefined) {
    vi.stubEnv('FAST_CHECK_SEED', env.seed)
  }
  const { fastCheckParameters } = await import('./fastCheckParameters')
  return fastCheckParameters
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('fastCheckParameters', () => {
  it('defaults to 50 runs without a seed', async () => {
    const parameters = await importParameters({})
    expect(parameters.numRuns).toBe(50)
    expect('seed' in parameters).toBe(false)
  })

  it('replays a negative FAST_CHECK_SEED reported by fast-check', async () => {
    const parameters = await importParameters({ seed: '-18927364' })
    expect('seed' in parameters && parameters.seed).toBe(-18927364)
  })

  it('replays a zero FAST_CHECK_SEED', async () => {
    const parameters = await importParameters({ seed: '0' })
    expect('seed' in parameters && parameters.seed).toBe(0)
  })

  it.each(['abc', '1.5', '', '   '])(
    'drops the invalid FAST_CHECK_SEED %j',
    async (seed) => {
      const parameters = await importParameters({ seed })
      expect('seed' in parameters).toBe(false)
    },
  )

  it('uses a positive FAST_CHECK_RUNS', async () => {
    const parameters = await importParameters({ runs: '200' })
    expect(parameters.numRuns).toBe(200)
  })

  it.each(['0', '-3', 'abc'])(
    'falls back to the default run count for FAST_CHECK_RUNS %j',
    async (runs) => {
      const parameters = await importParameters({ runs })
      expect(parameters.numRuns).toBe(50)
    },
  )
})
