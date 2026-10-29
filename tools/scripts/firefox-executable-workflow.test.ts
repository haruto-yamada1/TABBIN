import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const projectRoot = path.resolve(import.meta.dirname, '../..')
const workflow = parse(
  readFileSync(path.join(projectRoot, '.github/workflows/ci.yml'), 'utf8'),
) as {
  jobs: Record<string, { steps: { name?: string; run?: string }[] }>
}
const step = workflow.jobs['firefox-extension-smoke']?.steps.find(
  (candidate) => candidate.name === 'Resolve Playwright Firefox executable',
)

const resolveFirefox = (stub: string) => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'firefox-resolver-test-'),
  )
  const outputPath = path.join(directory, 'output')
  writeFileSync(outputPath, '')
  try {
    if (!step?.run) {
      throw new Error('Firefox executable resolution step is missing')
    }
    const result = spawnSync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-e',
        '-o',
        'pipefail',
        '-c',
        `${stub}\n${step.run}`,
      ],
      {
        cwd: projectRoot,
        env: {
          PATH: process.env.PATH,
          GITHUB_OUTPUT: outputPath,
          MOCK_FIREFOX_PATH: '/opt/firefox builds/firefox',
        },
        encoding: 'utf8',
        timeout: 5_000,
      },
    )
    return { ...result, output: readFileSync(outputPath, 'utf8') }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('Firefox workflow executable resolution', () => {
  it('writes the executable path returned by Playwright without shell errors', () => {
    const result = resolveFirefox(
      String.raw`bun() { printf '%s\n' "$MOCK_FIREFOX_PATH"; }`,
    )
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.output).toBe('path=/opt/firefox builds/firefox\n')
  })

  it('fails the step when Playwright cannot resolve the executable', () => {
    const result = resolveFirefox('bun() { return 17; }')
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(17)
    expect(result.output).toBe('')
  })
})
