import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createReport, recordTest } from './flake-report'

const directories: string[] = []
const temporary = () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'flake-cli-'))
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
const run = (file: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
  spawnSync('bun', [file, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10_000,
  })

const reportFixture = (runId: string) => {
  const report = createReport('vitest', '5.0.3')
  report.context.runId = runId
  report.context.event = 'push'
  report.suite = 'coverage'
  report.complete = true
  recordTest(report, {
    file: 'src/private.test.ts',
    project: 'node',
    browser: 'none',
    title: 'secret canary',
    expectedStatus: 'passed',
    attempts: [
      { index: 0, status: 'failed', durationMs: 3 },
      { index: 1, status: 'passed', durationMs: 2 },
    ],
  })
  return report
}

describe('diagnostic CLI boundaries', () => {
  it('publishes retry recovery and explicit absent history/suites without copying payload', () => {
    const directory = temporary()
    const current = path.join(directory, 'current')
    mkdirSync(current)
    writeFileSync(
      path.join(current, 'flake-coverage.json'),
      JSON.stringify(reportFixture('1')),
    )
    writeFileSync(
      path.join(current, 'flake-private.json'),
      '{"secret":"canary"}',
    )
    const output = path.join(directory, 'output')
    const summaryPath = path.join(directory, 'step-summary.md')
    const result = run(
      'tools/testing/report-flakes.ts',
      [
        '--current',
        current,
        '--history',
        path.join(directory, 'history'),
        '--output',
        output,
      ],
      { GITHUB_STEP_SUMMARY: summaryPath },
    )
    expect(result.status).toBe(0)
    const summary = JSON.parse(
      readFileSync(path.join(output, 'summary.json'), 'utf8'),
    )
    expect(summary.current.counts.flaky).toBe(1)
    expect(summary.ingestion.historyMetadata.unavailable).toBe(true)
    expect(summary.ingestion.currentRejected).toBe(1)
    expect(summary.missingSuites).toHaveLength(4)
    const markdown = readFileSync(summaryPath, 'utf8')
    expect(markdown).toContain('retry recovered: 1')
    expect(markdown).not.toContain('canary')
  })

  it('downloads only validated JSON entries and rejects archive payload with extra fields', () => {
    const directory = temporary()
    const bin = path.join(directory, 'bin')
    mkdirSync(bin)
    const report = reportFixture('7')
    writeFileSync(
      path.join(directory, 'flake-coverage.json'),
      JSON.stringify(report),
    )
    const archive = path.join(directory, 'report.zip')
    expect(
      spawnSync('zip', ['-q', archive, 'flake-coverage.json'], {
        cwd: directory,
      }).status,
    ).toBe(0)
    const fake = path.join(bin, 'gh')
    writeFileSync(
      fake,
      `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst endpoint = process.argv[3];\nif(endpoint.includes('workflows/ci.yml/runs')) console.log(JSON.stringify({workflow_runs:[{id:7,head_sha:'0000000000000000000000000000000000000000',run_attempt:2,event:'push',head_branch:'develop',pull_requests:[]}]}));\nelse if(endpoint.includes('/runs/7/artifacts')) console.log(JSON.stringify({total_count:3,artifacts:[{id:1,name:'flake-current-coverage',expired:false,size_in_bytes:1000},{id:2,name:'unrelated-evidence',expired:false,size_in_bytes:1},{id:3,name:'flake-current-expired',expired:true,size_in_bytes:1}]}));\nelse if(endpoint.includes('/artifacts/1/zip')) process.stdout.write(fs.readFileSync(process.env.TEST_ARCHIVE));\nelse process.exit(1);\n`,
    )
    chmodSync(fake, 0o700)
    const env = {
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      TEST_ARCHIVE: archive,
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '9',
    }
    const history = path.join(directory, 'history')
    expect(
      run('tools/testing/fetch-flake-history.ts', [history], env).status,
    ).toBe(0)
    expect(
      JSON.parse(
        readFileSync(path.join(history, 'history-metadata.json'), 'utf8'),
      ).downloaded,
    ).toBe(1)
    expect(
      JSON.parse(
        readFileSync(path.join(history, 'flake-7-coverage.json'), 'utf8'),
      ).tests[0].attempts,
    ).toHaveLength(2)
    expect(
      run('tools/testing/fetch-flake-history.ts', [history], env).status,
    ).toBe(1)
    expect(
      JSON.parse(
        readFileSync(path.join(history, 'history-metadata.json'), 'utf8'),
      ).expired,
    ).toBe(1)
    for (const [name, context] of [
      ['sha', { ...report.context, headSha: '1'.repeat(40) }],
      ['attempt', { ...report.context, runAttempt: 3 }],
    ] as const) {
      writeFileSync(
        path.join(directory, 'flake-coverage.json'),
        JSON.stringify({ ...report, context }),
      )
      const invalidArchive = path.join(directory, `${name}.zip`)
      expect(
        spawnSync('zip', ['-q', invalidArchive, 'flake-coverage.json'], {
          cwd: directory,
        }).status,
      ).toBe(0)
      const invalid = path.join(directory, name)
      expect(
        run('tools/testing/fetch-flake-history.ts', [invalid], {
          ...env,
          TEST_ARCHIVE: invalidArchive,
        }).status,
      ).toBe(0)
      expect(
        JSON.parse(
          readFileSync(path.join(invalid, 'history-metadata.json'), 'utf8'),
        ),
      ).toMatchObject({ downloaded: 0, rejected: 1 })
    }
    writeFileSync(
      path.join(directory, 'flake-coverage.json'),
      JSON.stringify({ ...report, stderr: 'private canary' }),
    )
    const rejectedArchive = path.join(directory, 'rejected.zip')
    expect(
      spawnSync('zip', ['-q', rejectedArchive, 'flake-coverage.json'], {
        cwd: directory,
      }).status,
    ).toBe(0)
    const rejected = path.join(directory, 'rejected')
    expect(
      run('tools/testing/fetch-flake-history.ts', [rejected], {
        ...env,
        TEST_ARCHIVE: rejectedArchive,
      }).status,
    ).toBe(0)
    const metadata = readFileSync(
      path.join(rejected, 'history-metadata.json'),
      'utf8',
    )
    expect(JSON.parse(metadata)).toMatchObject({
      downloaded: 0,
      rejected: 1,
      unavailable: false,
    })
    expect(metadata).not.toContain('canary')
  })

  it('makes transport failure visible and writes no secrets', () => {
    const directory = temporary()
    const bin = path.join(directory, 'bin')
    mkdirSync(bin)
    const gh = path.join(bin, 'gh')
    writeFileSync(gh, '#!/bin/sh\nprintf "private canary" >&2\nexit 1\n')
    chmodSync(gh, 0o700)
    const result = run(
      'tools/testing/fetch-flake-history.ts',
      [path.join(directory, 'history')],
      {
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
        GITHUB_REPOSITORY: 'owner/repo',
      },
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).unavailable).toBe(true)
    expect(result.stdout + result.stderr).not.toContain('canary')
  })

  it('repeats only a selected file/test name, and rejects broad or excessive requests', () => {
    const directory = temporary()
    const bin = path.join(directory, 'bin')
    mkdirSync(bin)
    const bunx = path.join(bin, 'bunx')
    const captured = path.join(directory, 'args.jsonl')
    writeFileSync(
      bunx,
      `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.TEST_ARGS, JSON.stringify(process.argv.slice(2))+'\\n');\n`,
    )
    chmodSync(bunx, 0o700)
    const env = {
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      TEST_ARGS: captured,
    }
    expect(
      run(
        'tools/scripts/test-flake.mjs',
        [
          '--',
          'src/example.test.ts',
          '--test-name',
          '^candidate$',
          '--repeat',
          '2',
        ],
        env,
      ).status,
    ).toBe(0)
    const calls = readFileSync(captured, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual([
      'vitest',
      'run',
      'src/example.test.ts',
      '--config',
      'vitest.ci.config.ts',
      '--project',
      'node',
      '--testNamePattern',
      '^candidate$',
    ])
    expect(
      run('tools/scripts/test-flake.mjs', ['src', '--repeat', '100'], env)
        .status,
    ).toBe(1)
    expect(
      run(
        'tools/scripts/test-flake.mjs',
        ['src/example.test.ts', '--repeat', '101'],
        env,
      ).status,
    ).toBe(1)
  })
})
