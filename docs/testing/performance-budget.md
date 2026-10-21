# Saved Tabs performance budgets (#909)

## Scope and overlap

Production baseline: `develop` at `e9c14f6d9447884388abeb78d248656b7fb8bdc1`.
The live issue has no comments. Closed #899 supplies bounded opening and native
Chrome/Firefox 10/100/500-tab observations; #900 supplies trusted search input;
#901 removes redundant read projections; #921 supplies the profiling build and
full async-operation settlement. Their production optimizations remain intact.
This change joins these measurements into a complete, repeatable CI comparison.
No production code, permissions, settings, persistence schema or dependency is
changed. Instrumentation stays in the existing isolated profiling build.

## Reproduce

Use the repository's `.node-version`, `.bun-version` and frozen dependencies.
Install Playwright Chromium, then run sequentially without other test/build work:

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run perf:budget
bun run perf:report --input test-results/budget --output reports/performance-budget --baseline docs/testing/performance-budget-baseline.json
```

Linux CI uses `xvfb-run -a bun run perf:budget`. The dedicated configuration has
one worker, zero retries and three fresh profiles for each size/view/workload.
It does not join ordinary extension E2E selection. Each test writes an anonymous
`budget-samples.json`; the report consumes only those files recursively.
Keep each batch in a separate directory for later comparisons. Pass a previous
`report.json` as `--baseline` to compare subsequent runs. Reviewing a baseline
update is explicit; the command never changes committed budgets or baselines.

The 14-case matrix has 1,000 and 10,000 unique URLs:

| Scenario            | Modes           | Completion and observed duration                                                                                                                                                                               |
| ------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial list        | Domain, Custom  | Navigation time origin through the exact full URL set, zero page-local reads/pending operations and two animation frames with no new work or React commit.                                                     |
| Search              | Domain, Custom  | Upper central observation (7th of 12 sorted latencies) for warm trusted Japanese input replacements, each to exact one-row results and settled readonly reads; maximum transaction count across all 12 inputs. |
| Category navigation | Domain, Custom  | The real next-parent-category / next-project button handler, native smooth-scroll end, and the same full URL set/operation settlement.                                                                         |
| Bulk opening        | Background tabs | Native IndexedDB session and production opening use case through completion of async recording browser ports.                                                                                                  |

There is no category-filter dropdown in Saved Tabs. “Category switching” here is
navigation to the next parent section in Domain mode, and to the next project
in Custom mode. Before measurement, a one-pixel scroll and return refreshes the
controls' geometry after content-visibility layout. The timed operation must
move the pane. It retains all URL rows and verifies the complete native storage
snapshot remains identical; it does not rename or reassign categories.

Initial/navigation fixtures reuse #921's 20 domains, five projects and two
memberships per URL, with one domain assigned to a parent category. Search uses
#900's existing fixture and also checks Japanese, partial/case-insensitive title,
category matching, clearing, no results and latest-query correctness.

Bulk opening seeds a separate synthetic database per invocation, exercises the
actual persistence runtime/session and bounded-pool use case, and records at the
browser API port. It keeps saved records (`removeTabAfterOpen: false`). Async
port completion exposes outstanding concurrency without creating 10,000 native
tabs or fetching URLs. A separate untimed run rejects one request and verifies
accurate partial failure. Exact request order, confirmed URL identity, saved
snapshot equality after close/reopen, pending work and database cleanup are
asserted. Native browser creation cost, window mode, delete-after-open and
cancel/resume remain covered by #899's tests/measurements; this sample does not
claim to measure those browser costs.

## Stable CI gates

Every sample must satisfy the following fixed work budgets. They apply to both
sizes; the purpose is to catch extra reads and loss of the bounded pool as data
grows. They were measured on the current implementation and reflect its existing
operation contract. Counts cover this extension page, not background-worker work.

| Scenario                                             | Domain     | Custom / background tabs |
| ---------------------------------------------------- | ---------- | ------------------------ |
| Initial readonly transactions                        | at most 12 | at most 37               |
| Initial session calls                                | at most 12 | at most 37               |
| Initial page-data queries                            | at most 2  | at most 2                |
| Search readonly transactions per input               | at most 1  | at most 6                |
| Category navigation reads/session calls/page queries | 0          | 0                        |
| Bulk pending browser creates                         | —          | at most 5                |
| Bulk confirmed/opened/remaining URLs                 | —          | exactly fixture size     |
| Failed requests in successful bulk sample            | —          | 0                        |
| Pending operations after measured work               | 0          | 0                        |

Each sample requires all scenario metrics, finite nonnegative duration and integer
nonnegative counts. Missing cases, mismatched environments, unknown identities,
duplicate case/repeat IDs, noncontiguous or unequal repeats and malformed evidence
fail closed. Work-budget failures remain failures even if timings improve. A
slow valid sample is retained and never fails merely for exceeding a time limit.
The test timeout is a hung-work watchdog, not a latency budget.

CI runs an unconditional `Saved Tabs Performance Budget` job on existing PR/push
triggers with the full three-repeat matrix. Even if a test fails, the report step
runs, rejects partial evidence and uploads the raw synthetic samples plus JSON
and Markdown report for 30 days. No baseline history is fetched with secrets or
write permissions. The CLI reports work deltas against the supplied baseline.
Duration ratios are advisory and require the same reported platform/architecture and exact browser,
Node and Bun versions; incompatible environments explicitly have no time ratio. Matching metadata does
not normalize hardware, kernel, scheduling or host load; ratios remain advisory.

## Interpretation and recorded evidence

The committed baseline was collected on 2026-10-20 (JST), on macOS arm64. It contains per-case median and nearest-rank p95 across
three fresh-profile observations. With only three samples, p95 is the maximum,
not a population tail estimate. Search values use the upper central observation of the inner twelve
inputs, so their outer p95 is a maximum of three such observations. This is a reproducible
starting point, not evidence of a general-device latency guarantee or speedup.

The profiling renderer adds overhead. Double animation frames mark an opportunity
to paint, not physical presentation. Category activation uses a DOM click; search
asserts trusted browser insertion but does not emulate IME composition. Bulk
port delays are synthetic. These different workloads must not be compared as a
single timing metric. Memory and React commit timing remain available in #921's
separate benchmark and are not hard CI limits.

Unit/CLI tests demonstrate that a work-count regression, malformed/partial batch,
invalid baseline or incompatible comparison cannot silently pass. Category
measurement was first run without its navigation action: it failed because the
pane stayed at scrollTop 0, then passed after invoking the real handler and
waiting for scrollend. Workflow tests first failed with the CI job absent.

See [baseline JSON](performance-budget-baseline.json) for the recorded environment,
source revision, three repeats per case, durations and work counts. Production
compatibility evidence comes from the unchanged search/rendering extension tests
and existing persistence/opening tests; this profiling batch is Chromium-only.

## Validation for this change

- Dedicated profiling batch: 30 tests passed, producing all 42 samples in 10.3 minutes.
- Common report/CLI: 65 focused unit/integration tests passed, including missing
  cases, work regressions, partial opening, invalid baselines and mixed revision
  evidence. The CI contract tests fail without the new job, then pass with it.
- `bun run quality:check` and `bun run test:coverage` passed on Node 24.17.0 /
  Bun 1.3.14. All global and per-glob thresholds passed; branch coverage is 85.57%.
- The ordinary production build passed all six selected extension tests: four
  search cases, exact parent-section navigation and card management/collapse.
- `bun run ci:lint` (actionlint/ShellCheck) and `bun run ci:security` (zizmor)
  passed. The new job keeps read-only permissions, pinned actions and synthetic
  data. Normal Chrome artifacts contain none of the budget/profiling hooks.
