import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createReport } from './flake-report'
import {
  inspectEvidence,
  readReports,
  selectHistoryRuns,
} from './telemetry-files'

const directories: string[] = []
const temporary = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'flake-boundary-'))
  directories.push(directory)
  return directory
}
afterEach(() =>
  directories
    .splice(0)
    .forEach((directory) =>
      rmSync(directory, { recursive: true, force: true }),
    ),
)

describe('bounded telemetry ingestion', () => {
  it('reads sanitized reports and rejects extra payloads without including error bodies', () => {
    const directory = temporary()
    writeFileSync(
      path.join(directory, 'flake-safe.json'),
      JSON.stringify(createReport('vitest', '5.0.3')),
    )
    writeFileSync(
      path.join(directory, 'flake-unsafe.json'),
      JSON.stringify({ secret: 'canary' }),
    )
    symlinkSync(
      path.join(directory, 'flake-safe.json'),
      path.join(directory, 'flake-link.json'),
    )
    const result = readReports(directory)
    expect(result.reports).toHaveLength(1)
    expect(result.rejected).toBe(2)
    expect(JSON.stringify(result)).not.toContain('canary')
  })

  it('reports absent data and enforces byte/file budgets', () => {
    expect(readReports('/nonexistent/flake-report-directory').missing).toBe(
      true,
    )
    const directory = temporary()
    writeFileSync(path.join(directory, 'flake-big.json'), ' '.repeat(101))
    expect(readReports(directory, { bytes: 100, files: 10 }).truncated).toBe(
      true,
    )
  })

  it('only admits bounded evidence and rejects symlinks', () => {
    const directory = temporary()
    expect(inspectEvidence(directory).available).toBe(false)
    mkdirSync(path.join(directory, 'test'))
    writeFileSync(path.join(directory, 'test/trace.zip'), 'zip')
    writeFileSync(path.join(directory, 'test/stdout.json'), 'private canary')
    expect(inspectEvidence(directory)).toMatchObject({
      available: true,
      files: 1,
      bytes: 3,
    })
    expect(inspectEvidence(directory, { bytes: 2, files: 10 }).available).toBe(
      false,
    )
    symlinkSync(
      path.join(directory, 'test/trace.zip'),
      path.join(directory, 'test/screenshot.png'),
    )
    expect(inspectEvidence(directory).available).toBe(false)
    const linkedRoot = path.join(temporary(), 'linked')
    symlinkSync(directory, linkedRoot)
    expect(inspectEvidence(linkedRoot).available).toBe(false)
  })

  it('selects same PR and develop history with an explicit sample limit', () => {
    const runs = [
      {
        id: 1,
        event: 'pull_request',
        head_branch: 'feature',
        pull_requests: [{ number: 939 }],
      },
      {
        id: 2,
        event: 'pull_request',
        head_branch: 'feature',
        pull_requests: [{ number: 940 }],
      },
      { id: 3, event: 'push', head_branch: 'develop', pull_requests: [] },
      { id: 4, event: 'push', head_branch: 'main', pull_requests: [] },
    ]
    expect(
      selectHistoryRuns(runs, '1', 939, 25).runs.map((run) => run.id),
    ).toEqual([3])
    expect(selectHistoryRuns(runs, '0', 939, 1)).toMatchObject({
      truncated: true,
      runs: [{ id: 1 }],
    })
    expect(
      selectHistoryRuns(runs, '0', undefined, 25).runs.map((run) => run.id),
    ).toEqual([3])
  })
})
