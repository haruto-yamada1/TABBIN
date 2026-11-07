import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createRenderPlan, escapeOverlayText, runMediaCommand } from './render'
import { parseScenario } from './scenario'

const scenario = parseScenario(
  JSON.parse(
    readFileSync(
      new URL('../scenarios/save-tabs.json', import.meta.url),
      'utf8',
    ),
  ),
)
const options = {
  scenario,
  locale: 'ja' as const,
  runDir: '/tmp/academy-render',
  nativeClips: { save: '/tmp/native/save.mov' },
  pageClip: '/tmp/capture/page.webm',
  pageStartSeconds: 4.25,
  fontFile: '/tmp/font.ttf',
}

describe('Academy render timeline', () => {
  it('keeps native and page sources separate and removes page preparation', () => {
    expect(createRenderPlan(options)).toMatchObject({
      seconds: 27,
      segments: [
        { kind: 'card', seconds: 3 },
        { kind: 'native', file: '/tmp/native/save.mov', start: 0, seconds: 10 },
        { kind: 'card', seconds: 3 },
        {
          kind: 'page',
          file: '/tmp/capture/page.webm',
          start: 4.25,
          seconds: 8,
        },
        { kind: 'card', seconds: 3 },
      ],
    })
  })

  it('refuses a missing native source instead of fabricating a clip', () => {
    expect(() => createRenderPlan({ ...options, nativeClips: {} })).toThrow(
      /native.*save/iu,
    )
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid page trim %s',
    (pageStartSeconds) => {
      expect(() => createRenderPlan({ ...options, pageStartSeconds })).toThrow(
        /trim/u,
      )
    },
  )

  it('renders captions as literal text, never executable markup', () => {
    expect(escapeOverlayText('<script>"x" & \'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    )
  })
})

describe('Media command execution boundary', () => {
  it('passes literal arguments and consumes complete stdout without a shell', async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), 'academy-media-'))
    try {
      const argument = '$HOME | `literal` "quote"'
      const output = await runMediaCommand(runDir, process.execPath, [
        '-e',
        'process.stdout.end(process.argv[1])',
        argument,
      ])
      expect(output).toBe(argument)
    } finally {
      await rm(runDir, { recursive: true, force: true })
    }
  })

  it('rejects failed commands while retaining raw decoder diagnostics', async () => {
    const runDir = await mkdtemp(path.join(os.tmpdir(), 'academy-media-'))
    try {
      await expect(
        runMediaCommand(runDir, process.execPath, [
          '-e',
          'process.stderr.write("decoder rejected frame");process.exitCode=3',
        ]),
      ).rejects.toThrow(/failed: 3/u)
      expect(await readFile(path.join(runDir, 'render.log'), 'utf8')).toContain(
        'decoder rejected frame',
      )
    } finally {
      await rm(runDir, { recursive: true, force: true })
    }
  })
})
