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

it('rejects incompatible native evidence before copying assets or invoking decoders', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'academy-publish-versions-'),
  )
  try {
    const current = await readFile(
      'tools/academy/scenarios/save-tabs.json',
      'utf8',
    )
    await Promise.all(
      (['ja', 'en'] as const).map(async (locale) => {
        const directory = path.join(root, locale)
        await mkdir(directory)
        await writeFile(path.join(directory, 'scenario.json'), current)
        await writeFile(
          path.join(directory, 'native-evidence.json'),
          JSON.stringify({
            installation: {
              source: 'chrome-web-store',
              id: 'dljblklbpmoocinnlcejeokopmfoldaj',
              installType: 'normal',
              name: 'TABBIN',
              manifestVersion: 3,
              version: locale === 'ja' ? '3.1.7' : '3.1.8',
            },
          }),
        )
      }),
    )
    // No video inputs or FFmpeg are needed: provenance must fail first.
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
    expect(result.stderr).toContain('different native installation versions')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
