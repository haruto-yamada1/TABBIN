import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, it } from 'vitest'

it('refuses stale rendered scenarios before copying product assets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'academy-publish-'))
  try {
    const current = JSON.parse(
      await readFile('tools/academy/scenarios/save-tabs.json', 'utf8'),
    )
    const scenario = { ...current, version: current.version + 1 }
    const directories = ['ja', 'en'].map((locale) => path.join(root, locale))
    await Promise.all(
      directories.map(async (directory) => {
        await mkdir(directory)
        await writeFile(
          path.join(directory, 'scenario.json'),
          JSON.stringify(scenario),
        )
      }),
    )
    const result = spawnSync(
      'bun',
      [
        'tools/academy/publishLesson.ts',
        '--ja',
        path.join(root, 'ja'),
        '--en',
        path.join(root, 'en'),
      ],
      { encoding: 'utf8' },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'Current scenario differs from the rendered input',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
