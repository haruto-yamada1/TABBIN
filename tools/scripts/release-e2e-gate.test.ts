import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const { scripts } = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> }

const runRelease = (failure = '') => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'release-gate-'))
  const log = path.join(directory, 'commands')
  writeFileSync(log, '')
  try {
    const result = spawnSync(
      'bash',
      [
        '-c',
        String.raw`
git() { return 0; }
bun() {
  if [ "$2" = 'release:e2e' ]; then
    eval "$RELEASE_E2E"
    return $?
  fi
  printf '%s\n' "$2" >> "$COMMAND_LOG"
  if [ "$2" = "$FAIL_STEP" ]; then return 23; fi
}
` + scripts['release:check'],
      ],
      {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          RELEASE_E2E: scripts['release:e2e'],
          COMMAND_LOG: log,
          FAIL_STEP: failure,
        },
        encoding: 'utf8',
      },
    )
    return { ...result, commands: readFileSync(log, 'utf8').trim().split('\n') }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('distribution release gate', () => {
  it('runs Chrome critical flows and Firefox IndexedDB smoke before succeeding', () => {
    const result = runRelease()
    expect(result.status).toBe(0)
    expect(result.commands).toContain('e2e:release')
    expect(result.commands).toContain('test:firefox:indexeddb-smoke')
    expect(scripts['quality:check']).not.toContain('release:e2e')
    expect(scripts['release:zip']).toMatch(/^bun run release:check &&/u)
  })

  it.each(['e2e:release', 'test:firefox:indexeddb-smoke'])(
    'fails closed when %s fails',
    (failure) => {
      const result = runRelease(failure)
      expect(result.status).toBe(23)
    },
  )

  it('does not continue to Firefox after the Chrome gate fails', () => {
    expect(runRelease('e2e:release').commands).not.toContain(
      'test:firefox:indexeddb-smoke',
    )
  })
})
