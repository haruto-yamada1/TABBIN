import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { aggregateReports } from './flake-report'
import { readReports } from './telemetry-files'

const argument = (name: string) => process.argv[process.argv.indexOf(name) + 1]
const currentDirectory = argument('--current')
const historyDirectory = argument('--history')
const outputDirectory = argument('--output')
if (
  !process.argv.includes('--current') ||
  !process.argv.includes('--history') ||
  !process.argv.includes('--output') ||
  !currentDirectory ||
  !historyDirectory ||
  !outputDirectory
) {
  throw new Error(
    'Usage: report-flakes.ts --current <directory> --history <directory> --output <directory>',
  )
}
const metadataSchema = z.strictObject({
  days: z.literal(14),
  selectedRuns: z.number().int().min(0),
  downloaded: z.number().int().min(0),
  bytes: z.number().int().min(0),
  rejected: z.number().int().min(0),
  expired: z.number().int().min(0),
  unavailable: z.boolean(),
  truncated: z.boolean(),
})
const metadataPath = path.join(historyDirectory, 'history-metadata.json')
let historyMetadata = {
  days: 14 as const,
  selectedRuns: 0,
  downloaded: 0,
  bytes: 0,
  rejected: 0,
  expired: 0,
  unavailable: true,
  truncated: false,
}
if (existsSync(metadataPath)) {
  try {
    historyMetadata = metadataSchema.parse(
      JSON.parse(readFileSync(metadataPath, 'utf8')),
    )
  } catch {
    /* Untrusted malformed metadata is unavailable, never copied to output. */
  }
}
const current = readReports(currentDirectory)
const history = readReports(historyDirectory)
const expectedSuites = [
  'coverage',
  'indexeddb-browser-semantics',
  'e2e-accessibility',
]
if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
  expectedSuites.push('firefox-extension-smoke')
}
const missingSuites = expectedSuites.filter(
  (suite) => !current.reports.some((report) => report.suite === suite),
)
const compact = (summary: ReturnType<typeof aggregateReports>) => ({
  ...summary,
  tests: summary.tests
    .filter(
      (test) => test.initialFailures || test.finalFailures || test.runErrors,
    )
    .slice(0, 500),
  candidatesTruncated:
    summary.tests.filter(
      (test) => test.initialFailures || test.finalFailures || test.runErrors,
    ).length > 500,
})
const summary = {
  schemaVersion: 1,
  current: compact(aggregateReports(current.reports)),
  prHistory: compact(
    aggregateReports(
      history.reports.filter(
        (report) => report.context.event === 'pull_request',
      ),
    ),
  ),
  developHistory: compact(
    aggregateReports(
      history.reports.filter((report) => report.context.event === 'push'),
    ),
  ),
  combined: compact(aggregateReports([...history.reports, ...current.reports])),
  missingSuites,
  ingestion: {
    currentRejected: current.rejected,
    historyRejected: history.rejected,
    currentTruncated: current.truncated,
    historyTruncated: history.truncated,
    historyMetadata,
  },
}
const table = (title: string, data: typeof summary.current) => {
  const counts = data.counts
  const rows = data.tests
    .slice(0, 30)
    .map(
      (test) =>
        `| ${test.file} (${test.id.slice(0, 12)}) | ${test.suite}/${test.project}/${test.browser} (${test.environment.os}, Node ${test.environment.node}, ${test.runner} ${test.environment.runnerVersion}) | ${test.initialFailures} | ${test.retryRecovered} | ${test.finalFailures} | ${test.executed} | ${test.flakeRate === null ? 'unknown' : `${(test.flakeRate * 100).toFixed(2)}%`} | ${test.diagnosis} |`,
    )
  return [
    `### ${title}`,
    '',
    `Reports: ${data.runs}. First-pass success: ${counts.passed}; retry recovered: ${counts.flaky}; final failed: ${counts.failed}; skipped: ${counts.skipped}; interrupted: ${counts.interrupted}; expected failure: ${counts.expectedFailure}.`,
    `Incomplete reports: ${data.incompleteRuns}; runner/setup errors: ${data.runErrors}.`,
    '',
    '| Test / ID | Environment | Initial fail | Recovered | Final fail | Executed | Flake rate | Investigation |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...rows,
    '',
    rows.length
      ? 'Table shows up to 30 candidates; sanitized summary.json shows up to 500. Rates exclude skip/interruption/expected failure.'
      : 'No candidates in the available telemetry. Missing or rejected data does not demonstrate a stable baseline.',
    '',
  ].join('\n')
}
const markdown = [
  '## Flaky test diagnostics (non-blocking)',
  '',
  `Missing expected suites: ${missingSuites.length ? missingSuites.join(', ') : 'none'}. Firefox startup smoke may be skipped; the standalone migration script is outside this runner telemetry.`,
  `History: last 14 days, sampled up to 25 runs / 50 artifacts / 30 MiB compressed. Downloaded: ${historyMetadata.downloaded}; expired: ${historyMetadata.expired}; unavailable: ${String(historyMetadata.unavailable)}; truncated: ${String(historyMetadata.truncated || history.truncated)}; rejected: ${historyMetadata.rejected + history.rejected}. Current rejected: ${current.rejected}; current truncated: ${String(current.truncated)}.`,
  '',
  'Labels are investigation hints. Repeated final failures need reproduction before confirming a regression; runner errors need setup/environment investigation. Retry recovery always retains the first failure.',
  '',
  table('Current PR / run', summary.current),
  table('Same PR history', summary.prHistory),
  table('Develop baseline history', summary.developHistory),
  table('Combined candidates by environment', summary.combined),
].join('\n')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(
  path.join(outputDirectory, 'summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
)
writeFileSync(path.join(outputDirectory, 'report.md'), markdown)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
}
console.log(
  `Flake diagnostics: ${current.reports.length} current reports, ${history.reports.length} history reports; ${missingSuites.length} expected suites missing.`,
)
