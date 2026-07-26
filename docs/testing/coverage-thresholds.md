# Coverage Thresholds

TABBIN uses Vitest coverage thresholds to detect test coverage regressions
before they reach `develop`. The configuration lives in
`vitest.ci.config.ts` and is enforced by the `coverage` job in
`.github/workflows/ci.yml`.

## Design decisions

### CI-only, not in `quality:check`

Coverage runs only in CI (`bun run test:coverage`), not in the local
`bun run quality:check` gate. Rationale:

- `quality:check` already runs the full test suite (~18 s). Adding coverage
  would add ~27 s (total ~45 s), making the pre-commit cycle noticeably
  slower.
- Coverage thresholds guard long-term trends, not individual commits.
  Running them in CI is sufficient for that purpose.
- Developers who want local coverage can still run `bun run test:coverage`
  on demand.

### Global floor

The global threshold is set below current coverage to allow normal
fluctuation while catching significant erosion:

| Metric     | Threshold | Baseline |
| ---------- | --------- | -------- |
| Statements | 90 %      | ~97 %    |
| Branches   | 85 %      | ~92 %    |
| Functions  | 90 %      | ~98 %    |
| Lines      | 90 %      | ~97 %    |

### Per-glob thresholds for critical domains

Important areas have tighter per-glob thresholds so a drop in those areas
is detected even when global coverage stays above the floor:

| Area                                        | Stmts | Branches | Funcs | Lines |
| ------------------------------------------- | ----- | -------- | ----- | ----- |
| `src/lib/storage/**`                        | 95    | 88       | 90    | 95    |
| `src/lib/background/**`                     | 95    | 90       | 95    | 95    |
| `src/features/options/lib/import-export/**` | 95    | 90       | 95    | 95    |
| `src/features/ai-chat/lib/**`               | 95    | 85       | 95    | 95    |
| `src/features/i18n/**`                      | 90    | 75       | 95    | 90    |

### Calibration

Thresholds were calibrated from the coverage baseline measured in #679.
Each per-glob threshold is set a few percentage points below the area's
current coverage to give a small buffer. When coverage improves, the
thresholds should be revisited and raised.

### What not to do

- Do not raise thresholds to chase a number — coverage is a signal, not a
  goal.
- Do not lower thresholds to make a failing build pass without
  understanding why coverage dropped.
- Do not exclude files from coverage to avoid threshold failures; add
  tests instead.
