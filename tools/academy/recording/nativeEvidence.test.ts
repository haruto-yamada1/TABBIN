import { createHash } from 'node:crypto'
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createAcademyFixture } from '#academy-fixture'
import { afterEach, describe, expect, it } from 'vitest'

import { finalizeRecording } from './nativeEvidence'

const temporaryDirs: string[] = []
afterEach(async () => {
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map(async (dir) => rm(dir, { force: true, recursive: true })),
  )
})

const createRun = async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'tabbin-native-gate-'))
  temporaryDirs.push(runDir)
  const fixture = createAcademyFixture()
  const result = {
    schemaVersion: 1,
    source: 'chrome-web-store',
    browser: 'chromium',
    profileRemoved: true,
    stage: 'finished',
    status: 'pending-native-evidence',
    failureCount: 2,
    saveFlow: { status: 'passed', errors: [] },
  }
  const after = {
    source: 'chrome-web-store',
    extensionId: 'dljblklbpmoocinnlcejeokopmfoldaj',
    expectedUrls: fixture.urls.map((item) => item.url),
    beforeTabs: fixture.urls.map((item, index) => ({
      id: index + 1,
      url: item.url,
      active: index === 0,
    })),
    afterTabs: [
      {
        id: 10,
        url: 'chrome-extension://dljblklbpmoocinnlcejeokopmfoldaj/app.html#/saved-tabs?mode=domain',
        active: true,
      },
    ],
    isOnToolbar: true,
    clickBehavior: 'saveWindowTabs',
    snapshot: fixture,
    validation: { status: 'passed', errors: [] },
  }
  const movie = Buffer.alloc(24)
  movie.writeUInt32BE(24, 0)
  movie.write('ftyp', 4)
  movie.write('qt  ', 8)
  await mkdir(path.join(runDir, 'native'))
  await writeFile(path.join(runDir, 'native', 'session.mov'), movie)
  const review = {
    os: 'macOS 27.2',
    browser: 'chromium',
    source: 'chrome-web-store',
    reviewedBy: 'Test operator',
    privacyReviewed: true,
    authenticNativeUi: true,
    clips: ['install', 'pin', 'save'].map((stage) => ({
      stage,
      file: 'native/session.mov',
      sha256: createHash('sha256').update(movie).digest('hex'),
      reviewed: true,
    })),
  }
  await Promise.all([
    writeFile(path.join(runDir, 'result.json'), JSON.stringify(result)),
    writeFile(path.join(runDir, 'after.json'), JSON.stringify(after)),
    writeFile(
      path.join(runDir, 'installation.json'),
      JSON.stringify({
        source: 'chrome-web-store',
        id: 'dljblklbpmoocinnlcejeokopmfoldaj',
        installType: 'normal',
        name: 'TABBIN',
        version: '2.0.19',
        manifestVersion: 3,
      }),
    ),
    writeFile(path.join(runDir, 'native-review.json'), JSON.stringify(review)),
  ])
  return { runDir, result, after, review }
}

describe('Native recording evidence gate', () => {
  it('accepts a verified store run with reviewed real files and retains raw failure history', async () => {
    const { runDir, result } = await createRun()
    const finalized = await finalizeRecording(runDir)
    expect(finalized.status).toBe('passed')
    expect(finalized.source).toBe('chrome-web-store')
    expect(finalized.failureCount).toBe(2)
    expect(finalized.installation?.installType).toBe('normal')
    expect(
      JSON.parse(await readFile(path.join(runDir, 'result.json'), 'utf8')),
    ).toEqual(result)
    expect(
      JSON.parse(
        await readFile(path.join(runDir, 'final-result.json'), 'utf8'),
      ),
    ).toEqual(finalized)
    expect((await finalizeRecording(runDir)).status).toBe('failed')
    expect(
      JSON.parse(
        await readFile(path.join(runDir, 'final-result.json'), 'utf8'),
      ),
    ).toEqual(finalized)
  })

  it('rejects missing reviews or missing required stages', async () => {
    const { runDir, review } = await createRun()
    await rm(path.join(runDir, 'native-review.json'))
    expect((await finalizeRecording(runDir)).status).toBe('failed')
    await writeFile(
      path.join(runDir, 'native-review.json'),
      JSON.stringify({ ...review, clips: review.clips.slice(1) }),
    )
    expect((await finalizeRecording(runDir)).status).toBe('failed')
  })

  it.each(['privacyReviewed', 'authenticNativeUi'])(
    'requires the operator attestation %s',
    async (field) => {
      const { runDir, review } = await createRun()
      await writeFile(
        path.join(runDir, 'native-review.json'),
        JSON.stringify({ ...review, [field]: false }),
      )
      expect((await finalizeRecording(runDir)).status).toBe('failed')
    },
  )

  it('rejects clips that have not been reviewed and empty reviewer names', async () => {
    const { runDir, review } = await createRun()
    await writeFile(
      path.join(runDir, 'native-review.json'),
      JSON.stringify({
        ...review,
        reviewedBy: ' ',
        clips: review.clips.map((clip) => ({ ...clip, reviewed: false })),
      }),
    )
    expect((await finalizeRecording(runDir)).status).toBe('failed')
  })

  it('rejects missing, empty, non-video or modified clip files', async () => {
    const { runDir } = await createRun()
    const filename = path.join(runDir, 'native', 'session.mov')
    await rm(filename)
    expect((await finalizeRecording(runDir)).status).toBe('failed')
    await writeFile(filename, Buffer.alloc(0))
    expect((await finalizeRecording(runDir)).status).toBe('failed')
    await writeFile(filename, 'This is a screenshot description, not a video.')
    expect((await finalizeRecording(runDir)).status).toBe('failed')
    await writeFile(
      filename,
      Buffer.from([26, 69, 223, 163, ...Array.from({ length: 20 }, () => 0)]),
    )
    expect((await finalizeRecording(runDir)).status).toBe('failed')
  })

  it.each([
    '../outside.mov',
    '/tmp/outside.mov',
    String.raw`C:\outside.mov`,
    'native/../../outside.mov',
  ])('rejects paths outside the run directory: %s', async (file) => {
    const { runDir, review } = await createRun()
    await writeFile(
      path.join(runDir, 'native-review.json'),
      JSON.stringify({
        ...review,
        clips: review.clips.map((clip) => ({ ...clip, file })),
      }),
    )
    expect((await finalizeRecording(runDir)).status).toBe('failed')
  })

  it('rejects symlinks escaping the run directory', async () => {
    const { runDir, review } = await createRun()
    const outside = await mkdtemp(
      path.join(os.tmpdir(), 'tabbin-native-outside-'),
    )
    temporaryDirs.push(outside)
    await writeFile(path.join(outside, 'clip.mov'), Buffer.alloc(24))
    await symlink(
      path.join(outside, 'clip.mov'),
      path.join(runDir, 'escape.mov'),
    )
    await writeFile(
      path.join(runDir, 'native-review.json'),
      JSON.stringify({
        ...review,
        clips: review.clips.map((clip) => ({ ...clip, file: 'escape.mov' })),
      }),
    )
    expect((await finalizeRecording(runDir)).status).toBe('failed')
  })

  it('rejects directory clip targets', async () => {
    const { runDir, review } = await createRun()
    await writeFile(
      path.join(runDir, 'native-review.json'),
      JSON.stringify({
        ...review,
        clips: review.clips.map((clip) => ({ ...clip, file: 'native' })),
      }),
    )
    expect((await finalizeRecording(runDir)).status).toBe('failed')
  })

  it.each([
    { saveFlow: { status: 'failed', errors: ['saved-urls'] } },
    { stage: 'prepared' },
    { profileRemoved: false },
  ])('rejects failed or unfinished save runs: %j', async (update) => {
    const { runDir, result } = await createRun()
    await writeFile(
      path.join(runDir, 'result.json'),
      JSON.stringify({ ...result, ...update }),
    )
    expect((await finalizeRecording(runDir)).status).toBe('failed')
  })

  it.each([
    { installType: 'development' },
    { installType: null },
    { source: 'unpacked-development' },
    { id: 'different-extension' },
  ])(
    'requires official normal store installation evidence: %j',
    async (update) => {
      const { runDir } = await createRun()
      await writeFile(
        path.join(runDir, 'installation.json'),
        JSON.stringify({
          source: 'chrome-web-store',
          id: 'dljblklbpmoocinnlcejeokopmfoldaj',
          installType: 'normal',
          name: 'TABBIN',
          version: '2.0.19',
          manifestVersion: 3,
          ...update,
        }),
      )
      expect((await finalizeRecording(runDir)).status).toBe('failed')
    },
  )

  it('can retry missing evidence without replacing the raw run or a failed final result', async () => {
    const { runDir, review } = await createRun()
    await rm(path.join(runDir, 'native-review.json'))
    expect((await finalizeRecording(runDir)).status).toBe('failed')
    await writeFile(
      path.join(runDir, 'native-review.json'),
      JSON.stringify(review),
    )
    expect((await finalizeRecording(runDir)).status).toBe('passed')
    expect(
      (await readFile(path.join(runDir, 'finalization-attempts.jsonl'), 'utf8'))
        .trim()
        .split('\n'),
    ).toHaveLength(2)
  })

  it('rechecks the underlying save evidence and rejects development installation clips', async () => {
    const { runDir, after, result, review } = await createRun()
    await writeFile(
      path.join(runDir, 'after.json'),
      JSON.stringify({ ...after, isOnToolbar: false }),
    )
    expect((await finalizeRecording(runDir)).status).toBe('failed')
    await Promise.all([
      writeFile(
        path.join(runDir, 'after.json'),
        JSON.stringify({ ...after, source: 'unpacked-development' }),
      ),
      writeFile(
        path.join(runDir, 'result.json'),
        JSON.stringify({ ...result, source: 'unpacked-development' }),
      ),
      writeFile(
        path.join(runDir, 'native-review.json'),
        JSON.stringify({ ...review, source: 'unpacked-development' }),
      ),
    ])
    expect((await finalizeRecording(runDir)).status).toBe('failed')
  })
})
