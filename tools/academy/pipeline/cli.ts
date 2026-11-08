import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { parseArgs, promisify } from 'node:util'

import { createAcademyFixture } from '#academy-fixture'
import { verifyFinalizedRecording } from '#academy-native-evidence'
import { z } from 'zod'

import {
  captionsVtt,
  digest,
  fileDigest,
  promoteVerifiedBundle,
  verifyLessonArtifacts,
} from './artifacts'
import { capturePage } from './capture'
import { renderLesson } from './render'
import { parseScenario } from './scenario'
import type { LessonScenario, Locale } from './scenario'

const execute = promisify(execFile)
const json = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(file, 'utf8'))
const save = async (dir: string, name: string, value: unknown) =>
  writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
const takeRoot = path.resolve('recordings/academy/pipeline/runs')
const createTake = async () => {
  await mkdir(takeRoot, { recursive: true })
  return mkdtemp(path.join(takeRoot, 'take-'))
}
const ownedFile = async (root: string, relative: string) => {
  if (
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    relative.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new Error('Expected a relative file inside the take.')
  }
  const actualRoot = await realpath(root)
  const file = await realpath(path.join(actualRoot, relative))
  const distance = path.relative(actualRoot, file)
  if (!distance || distance.startsWith('..') || path.isAbsolute(distance)) {
    throw new Error('Input escapes the take.')
  }
  return file
}
const clipSchema = z.object({
  file: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
})
const recordedSchema = z.looseObject({
  status: z.literal('passed'),
  scenarioSha256: z.string(),
  clips: z.object({
    install: clipSchema.optional(),
    pin: clipSchema.optional(),
    save: clipSchema,
  }),
  page: clipSchema,
  pageStartSeconds: z.number().nonnegative(),
})

const record = async (scenario: LessonScenario, nativeRun: string) => {
  const runDir = await createTake()
  console.log(JSON.stringify({ status: 'recording', runDir }))
  try {
    const evidence = await verifyFinalizedRecording(nativeRun)
    if (
      evidence.after.snapshot.urls.length !== scenario.assertions.urls ||
      evidence.after.snapshot.collections.filter(
        (collection) => collection.definition.type === 'domain',
      ).length !== scenario.assertions.domains
    ) {
      throw new Error(
        'Native saved snapshot does not satisfy scenario assertions.',
      )
    }
    const sourceRoot = await realpath(nativeRun)
    const clips: Partial<
      Record<'install' | 'pin' | 'save', { file: string; sha256: string }>
    > = {}
    await Promise.all(
      evidence.clips.map(async (clip) => {
        const name = `native-${clip.stage}${path.extname(clip.file)}`
        await copyFile(
          await ownedFile(sourceRoot, clip.file),
          path.join(runDir, name),
        )
        if ((await fileDigest(path.join(runDir, name))) !== clip.sha256) {
          throw new Error('Native input changed during import.')
        }
        clips[clip.stage] = { file: name, sha256: clip.sha256 }
      }),
    )
    await save(runDir, 'scenario.json', scenario)
    await save(runDir, 'native-evidence.json', evidence)
    const snapshot =
      scenario.pageSeed === 'organized'
        ? createAcademyFixture('minimal')
        : evidence.after.snapshot
    if (scenario.pageSeed === 'organized') {
      const learning = snapshot.groups.find(
        (group) => group.name === 'Learning',
      )
      if (!learning) {
        throw new Error('Learning fixture missing.')
      }
      snapshot.collections = snapshot.collections.map((collection) => {
        if (collection.definition.type !== 'domain') {
          return collection
        }
        if (collection.definition.domain === 'notes.filming.test') {
          return { ...collection, groupId: learning.id }
        }
        if (collection.definition.domain === 'garden.filming.test') {
          return {
            ...collection,
            groupId: snapshot.groups.find((group) => group.name === 'Personal')
              ?.id,
          }
        }
        return collection
      })
    }
    const captured = await capturePage({
      runDir,
      snapshot,
      actions: scenario.actions,
      viewport: scenario.viewport,
      browserVersion: scenario.browserVersion,
    })
    const { stdout: commit } = await execute('git', ['rev-parse', 'HEAD'])
    await save(runDir, 'record.json', {
      status: 'passed',
      scenarioSha256: digest(JSON.stringify(scenario)),
      clips,
      page: {
        file: captured.file,
        sha256: await fileDigest(await ownedFile(runDir, captured.file)),
      },
      pageStartSeconds: captured.contentStartSeconds,
      sourceCommit: commit.trim(),
      capture: captured,
      editBoundary:
        'Native store recording -> same saved snapshot replayed in a fresh development profile; not one continuous take.',
    })
    console.log(JSON.stringify({ status: 'recorded', runDir }))
    return runDir
  } catch (error) {
    await save(runDir, 'record-failure.json', {
      status: 'failed',
      error: String(error),
    })
    throw new Error(`Recording failed; diagnostics retained at ${runDir}`, {
      cause: error,
    })
  }
}

const render = async (sourceDir: string, locale: Locale, fontFile: string) => {
  const scenario = parseScenario(
    await json(path.join(sourceDir, 'scenario.json')),
  )
  const recorded = recordedSchema.parse(
    await json(path.join(sourceDir, 'record.json')),
  )
  if (recorded.scenarioSha256 !== digest(JSON.stringify(scenario))) {
    throw new Error('Scenario changed after recording; record a new take.')
  }
  const runDir = await createTake()
  console.log(JSON.stringify({ status: 'rendering', runDir }))
  try {
    const nativeClips: Partial<Record<'install' | 'pin' | 'save', string>> = {}
    await Promise.all(
      (['install', 'pin', 'save'] as const).map(async (stage) => {
        const clip = recorded.clips[stage]
        if (!clip) {
          return
        }
        const source = await ownedFile(sourceDir, clip.file)
        const target = path.join(runDir, path.basename(clip.file))
        await copyFile(source, target)
        if ((await fileDigest(target)) !== clip.sha256) {
          throw new Error('Reviewed native clip digest mismatch.')
        }
        nativeClips[stage] = target
      }),
    )
    const pageClip = path.join(runDir, 'page.webm')
    await copyFile(await ownedFile(sourceDir, recorded.page.file), pageClip)
    if ((await fileDigest(pageClip)) !== recorded.page.sha256) {
      throw new Error('Recorded page clip digest mismatch.')
    }
    await save(runDir, 'scenario.json', scenario)
    await save(runDir, 'source-record.json', recorded)
    await copyFile(
      await ownedFile(sourceDir, 'native-evidence.json'),
      path.join(runDir, 'native-evidence.json'),
    )
    const rendered = await renderLesson({
      scenario,
      locale,
      runDir,
      nativeClips,
      pageClip,
      pageStartSeconds: recorded.pageStartSeconds,
      fontFile: path.resolve(fontFile),
    })
    await Promise.all(
      (['ja', 'en'] as const).map(async (language) => {
        await writeFile(
          path.join(runDir, `${scenario.id}.${language}.vtt`),
          captionsVtt(scenario, language),
          { flag: 'wx' },
        )
      }),
    )
    const verification = await verifyLessonArtifacts(runDir, scenario)
    await save(runDir, 'verification.json', verification)
    await save(runDir, 'render.json', {
      locale,
      ...rendered,
      file: scenario.output.filename,
      scenarioSha256: recorded.scenarioSha256,
      nativeClips: recorded.clips,
      page: recorded.page,
      visualReview:
        'pending: replay final video; confirm native save, settings explanation, edit boundary, subtitles, zoom and privacy before product publication',
    })
    const destination = await promoteVerifiedBundle(
      runDir,
      path.resolve(
        'recordings/academy/pipeline/releases',
        scenario.id,
        `v${scenario.version}`,
        locale,
      ),
      () => verification,
    )
    console.log(
      JSON.stringify({
        status: 'passed',
        directory: destination,
        file: path.join(destination, scenario.output.filename),
        verification,
      }),
    )
    return destination
  } catch (error) {
    await save(runDir, 'render-failure.json', {
      status: 'failed',
      error: String(error),
    })
    throw new Error(`Rendering failed; diagnostics retained at ${runDir}`, {
      cause: error,
    })
  }
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    lesson: { type: 'string', default: 'save-tabs' },
    'native-run': { type: 'string' },
    run: { type: 'string' },
    locale: { type: 'string', default: 'ja' },
    font: { type: 'string' },
  },
})
const command = positionals.find((item) => item !== '--')
if (!['record', 'render', 'verify', 'make'].includes(command ?? '')) {
  throw new Error('Use record, render, verify or make.')
}
if (values.locale !== 'ja' && values.locale !== 'en') {
  throw new Error('--locale must be ja or en.')
}
if (!/^[a-z][a-z0-9-]*$/u.test(values.lesson)) {
  throw new Error('Invalid --lesson.')
}
const scenario = parseScenario(
  await json(path.resolve('tools/academy/scenarios', `${values.lesson}.json`)),
)
if (scenario.id !== values.lesson) {
  throw new Error('Scenario id and --lesson differ.')
}
if (command === 'make') {
  if (!values['native-run'] || !values.font) {
    throw new Error('--native-run and --font are required.')
  }
  await execute(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-version'])
  await execute(process.env.FFPROBE_PATH ?? 'ffprobe', ['-version'])
  // Keep browser capture and media rendering in independent processes. The durable
  // record manifest is their boundary, just as when running each command manually.
  const cli = path.resolve('tools/academy/pipeline/cli.ts')
  const recording = await execute(
    process.execPath,
    [
      cli,
      'record',
      '--lesson',
      values.lesson,
      '--native-run',
      path.resolve(values['native-run']),
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  )
  process.stdout.write(recording.stdout)
  process.stderr.write(recording.stderr)
  const lines = recording.stdout
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('{'))
  const recorded = z
    .object({ status: z.literal('recorded'), runDir: z.string() })
    .parse(JSON.parse(lines.at(-1) ?? 'null'))
  const rendering = await execute(
    process.execPath,
    [
      cli,
      'render',
      '--run',
      recorded.runDir,
      '--locale',
      values.locale,
      '--font',
      path.resolve(values.font),
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  )
  process.stdout.write(rendering.stdout)
  process.stderr.write(rendering.stderr)
} else if (command === 'record') {
  if (!values['native-run']) {
    throw new Error('--native-run must reference a finalized #998 recording.')
  }
  await record(scenario, path.resolve(values['native-run']))
} else if (command === 'render') {
  if (!values.run || !values.font) {
    throw new Error('--run and --font are required.')
  }
  await render(path.resolve(values.run), values.locale, values.font)
} else {
  if (!values.run) {
    throw new Error('--run must reference a completed render directory.')
  }
  const root = await realpath(path.resolve(values.run))
  const storedScenario = parseScenario(
    await json(await ownedFile(root, 'scenario.json')),
  )
  const verified = await verifyLessonArtifacts(root, storedScenario)
  const previous = await json(await ownedFile(root, 'verification.json'))
  if (JSON.stringify(verified) !== JSON.stringify(previous)) {
    throw new Error('Output changed after verification.')
  }
  console.log(JSON.stringify(verified))
}
