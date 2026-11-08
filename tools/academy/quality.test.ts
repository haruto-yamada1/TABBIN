import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ACADEMY_LESSONS,
  ACADEMY_MESSAGES,
} from '@/features/academy/domain/academyCatalog'
import * as lessonGuides from '@/features/academy/presentation/academyLessonGuide'

import { captionsVtt } from './pipeline/artifacts'
import { parseScenario } from './pipeline/scenario'
import { verifyAcademyQuality } from './quality'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})
const digest = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex')

const fixture = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'academy-quality-'))
  roots.push(root)
  const write = (name: string, value: string | Uint8Array) => {
    const file = path.join(root, name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, value)
  }
  const original = ACADEMY_LESSONS.find(
    (lesson) => lesson.lessonId === 'restore-tabs',
  )
  if (!original) {
    throw new Error('Restore lesson missing')
  }
  const lesson = structuredClone(original)
  lesson.prerequisiteLessonIds = []
  const scenarioText = readFileSync(
    'tools/academy/scenarios/restore-tabs.json',
    'utf8',
  )
  const scenario = parseScenario(JSON.parse(scenarioText))
  write('tools/academy/scenarios/restore-tabs.json', scenarioText)
  write(
    'src/components/controls.tsx',
    'export const Controls = () => <button data-tour="academy-restore-tabs" />',
  )
  write(
    'src/features/academy/presentation/useScreenGuideController.ts',
    'export const selector = \'[data-tour="academy-restore-tabs"]\'',
  )
  const video = strToU8('0000ftypminimal-test-video')
  const manifest = {
    lessonId: lesson.lessonId,
    version: scenario.version,
    scenarioSha256: digest(scenarioText),
    assets: Object.fromEntries(
      (['ja', 'en'] as const).map((locale) => [
        locale,
        { bytes: video.length, sha256: digest(video) },
      ]),
    ),
  }
  const media: Record<string, Uint8Array> = {}
  const addMedia = (name: string, bytes: Uint8Array) => {
    write(`src/public/${name}`, bytes)
    media[name] = bytes
  }
  for (const locale of ['ja', 'en'] as const) {
    addMedia(`academy/videos/restore-tabs.${locale}.mp4`, video)
    addMedia(
      `academy/videos/restore-tabs.${locale}.vtt`,
      strToU8(captionsVtt(scenario, locale)),
    )
  }
  addMedia(
    'academy/videos/restore-tabs.poster.jpg',
    new Uint8Array([255, 216, 255, 217]),
  )
  const manifestPath = 'academy/videos/restore-tabs.json'
  addMedia(manifestPath, strToU8(JSON.stringify(manifest)))
  const options = {
    root,
    lessons: [lesson],
    courses: [
      {
        courseId: lesson.courseId,
        titleKey: 'academy.courses.recovery',
        lessonIds: [lesson.lessonId],
      },
    ],
    messages: structuredClone(ACADEMY_MESSAGES),
  }
  return { root, write, options, lesson, manifest, manifestPath, media }
}

describe('Academy integrated quality contracts', () => {
  it('checks the real curriculum and all production targets without rendering media', () => {
    expect(verifyAcademyQuality()).toMatchObject({ lessons: 8, videos: 16 })
  })

  it('accepts an internally consistent curriculum and its production directory or ZIP', () => {
    const context = fixture()
    for (const [name, bytes] of Object.entries(context.media)) {
      context.write(`build/${name}`, bytes)
    }
    context.write('extension.zip', zipSync(context.media))
    expect(
      verifyAcademyQuality({
        ...context.options,
        artifacts: [
          path.join(context.root, 'build'),
          path.join(context.root, 'extension.zip'),
        ],
      }),
    ).toMatchObject({ lessons: 1, videos: 2, artifacts: 2 })
  })

  it('rejects missing step targets even when the name survives in comments or selector strings', () => {
    const context = fixture()
    context.write(
      'src/components/controls.tsx',
      '// data-tour="academy-restore-tabs"\nexport const unused = \'[data-tour="academy-restore-tabs"]\'',
    )
    expect(() => verifyAcademyQuality(context.options)).toThrow(
      /Missing production data-tour: academy-restore-tabs/u,
    )
  })

  it('checks read-only guide targets independently from practice step targets', () => {
    const context = fixture()
    context.write(
      'src/features/academy/presentation/useScreenGuideController.ts',
      'export const selector = \'[data-tour="removed-live-target"]\'',
    )
    expect(() => verifyAcademyQuality(context.options)).toThrow(
      /Missing production data-tour: removed-live-target/u,
    )
  })

  it('supports literal targets forwarded through the existing dataTour component prop', () => {
    const context = fixture()
    context.write(
      'src/components/controls.tsx',
      'export const Controls = () => <CardActionButton dataTour="academy-restore-tabs" />',
    )
    expect(() => verifyAcademyQuality(context.options)).not.toThrow()
  })

  it.each(['lesson', 'version', 'digest'] as const)(
    'rejects a publication manifest with a stale %s reference',
    (field) => {
      const context = fixture()
      const manifest = {
        ...context.manifest,
        ...(field === 'lesson' ? { lessonId: 'domain-mode' } : {}),
        ...(field === 'version' ? { version: 900 } : {}),
        ...(field === 'digest' ? { scenarioSha256: '0'.repeat(64) } : {}),
      }
      context.write(
        `src/public/${context.manifestPath}`,
        JSON.stringify(manifest),
      )
      expect(() => verifyAcademyQuality(context.options)).toThrow(
        /Publication does not match scenario/u,
      )
    },
  )

  it('rejects a scenario belonging to another lesson or catalog scenario version', () => {
    const context = fixture()
    context.lesson.scenarioVersion = 900
    expect(() => verifyAcademyQuality(context.options)).toThrow(
      /Scenario does not match catalog/u,
    )
  })

  it('rejects a missing Japanese title rather than accepting fallback text', () => {
    const context = fixture()
    delete context.options.messages.ja[context.lesson.titleKey]
    expect(() => verifyAcademyQuality(context.options)).toThrow(
      /Missing ja translation/u,
    )
  })

  it('rejects a missing text guide even when all catalog translations exist', () => {
    const context = fixture()
    vi.spyOn(lessonGuides, 'getAcademyGuide').mockReturnValue([])
    expect(() => verifyAcademyQuality(context.options)).toThrow(
      /Missing ja text guide/u,
    )
  })

  it('rejects missing localized media, invalid subtitles and changed video bytes', () => {
    const context = fixture()
    context.write('src/public/academy/videos/restore-tabs.en.vtt', 'WEBVTT')
    expect(() => verifyAcademyQuality(context.options)).toThrow(
      /Caption differs from scenario/u,
    )
    context.write(
      'src/public/academy/videos/restore-tabs.en.vtt',
      context.media['academy/videos/restore-tabs.en.vtt'] ?? new Uint8Array(),
    )
    context.write(
      'src/public/academy/videos/restore-tabs.en.mp4',
      '0000ftypchanged-test-video',
    )
    expect(() => verifyAcademyQuality(context.options)).toThrow(
      /Video differs from publication/u,
    )
  })

  it('fails closed when a production ZIP omits a caption or changes a bundled video', () => {
    const context = fixture()
    const media = { ...context.media }
    delete media['academy/videos/restore-tabs.en.vtt']
    context.write('missing.zip', zipSync(media))
    expect(() =>
      verifyAcademyQuality({
        ...context.options,
        artifacts: [path.join(context.root, 'missing.zip')],
      }),
    ).toThrow(/Missing or changed packaged Academy asset/u)
    context.write(
      'changed.zip',
      zipSync({
        ...context.media,
        'academy/videos/restore-tabs.en.mp4': strToU8('changed'),
      }),
    )
    expect(() =>
      verifyAcademyQuality({
        ...context.options,
        artifacts: [path.join(context.root, 'changed.zip')],
      }),
    ).toThrow(/Missing or changed packaged Academy asset/u)
  })
})
