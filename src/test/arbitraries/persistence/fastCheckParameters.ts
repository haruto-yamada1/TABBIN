const parseSafeInteger = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = parseSafeInteger(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

const numRuns = parsePositiveInteger(process.env.FAST_CHECK_RUNS)
// fast-check accepts any 32-bit seed and reports negative seeds on failure,
// so replay values must accept negative integers and 0 as well.
const seed = parseSafeInteger(process.env.FAST_CHECK_SEED)

/**
 * Shared fast-check parameters for every persistence property test.
 *
 * `FAST_CHECK_RUNS` raises the run count for nightly / manual deep runs and
 * `FAST_CHECK_SEED` replays the exact failing seed printed by fast-check.
 * See docs/testing/property-based-tests.md for the reproduction workflow.
 */
export const fastCheckParameters = {
  numRuns: numRuns ?? 50,
  ...(seed === undefined ? {} : { seed }),
} as const
