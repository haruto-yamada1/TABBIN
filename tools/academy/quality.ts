import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import * as ts from '#typescript-parser'
import { unzipSync } from 'fflate'
import { z } from 'zod'

import {
  ACADEMY_COURSES,
  ACADEMY_LESSONS,
  ACADEMY_MESSAGES,
  validateCatalog,
} from '@/features/academy/domain/academyCatalog'
import type { Course, Lesson } from '@/features/academy/domain/academySchemas'
import { getAcademyGuide } from '@/features/academy/presentation/academyLessonGuide'

import { captionsVtt } from './pipeline/artifacts'
import { parseScenario } from './pipeline/scenario'
import { verifyAcademyArtifacts } from './verifyArtifacts'

const publicationSchema = z.object({
  lessonId: z.string(),
  version: z.number().int().positive(),
  scenarioSha256: z.string(),
  assets: z.object({
    ja: z.object({ bytes: z.number().int().positive(), sha256: z.string() }),
    en: z.object({ bytes: z.number().int().positive(), sha256: z.string() }),
  }),
})
const hash = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex')
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(filename)
    }
    return /\.tsx?$/u.test(entry.name) &&
      !/\.(?:test|stories)\.tsx?$/u.test(entry.name)
      ? [filename]
      : []
  })

// Parse JSX attributes: a matching comment or selector string is not a target.
const productionTargets = (root: string) => {
  const targets = new Set<string>()
  ts.withSourceParser((parse) => {
    for (const filename of sourceFiles(path.join(root, 'src'))) {
      const source = readFileSync(filename, 'utf8')
      if (!source.includes('data-tour') && !source.includes('dataTour')) {
        continue
      }
      const visit = (node: ts.Node): void => {
        if (
          ts.isJsxAttribute(node) &&
          ['data-tour', 'dataTour'].includes(node.name.getText()) &&
          node.initializer
        ) {
          const literals = (child: ts.Node): void => {
            if (ts.isStringLiteralLike(child)) {
              targets.add(child.text)
            }
            ts.forEachChild(child, literals)
          }
          literals(node.initializer)
        }
        ts.forEachChild(node, visit)
      }
      visit(parse(filename, source))
    }
  })
  return targets
}

type QualityOptions = {
  root?: string
  lessons?: readonly Lesson[]
  courses?: readonly Course[]
  messages?: Record<'ja' | 'en', Record<string, string>>
  artifacts?: readonly string[]
}

type ReadAsset = (name: string) => Uint8Array
type Publication = z.infer<typeof publicationSchema>
type Scenario = ReturnType<typeof parseScenario>

const verifyTranslations = (
  messages: NonNullable<QualityOptions['messages']>,
  keys: string[],
) => {
  for (const locale of ['ja', 'en'] as const) {
    for (const key of keys) {
      if (!messages[locale][key]?.trim()) {
        throw new Error(`Missing ${locale} translation: ${key}`)
      }
    }
  }
}

const readLessonScenario = (
  root: string,
  lesson: Lesson,
  readAsset: ReadAsset,
) => {
  const scenarioText = readFileSync(
    path.join(root, `tools/academy/scenarios/${lesson.lessonId}.json`),
    'utf8',
  )
  const scenario = parseScenario(JSON.parse(scenarioText))
  if (
    scenario.lessonId !== lesson.lessonId ||
    scenario.version !== lesson.scenarioVersion
  ) {
    throw new Error(`Scenario does not match catalog: ${lesson.lessonId}`)
  }
  const publication = publicationSchema.parse(
    JSON.parse(
      new TextDecoder().decode(
        readAsset(`academy/videos/${lesson.lessonId}.json`),
      ),
    ),
  )
  if (
    publication.lessonId !== lesson.lessonId ||
    publication.version !== scenario.version ||
    publication.scenarioSha256 !== hash(scenarioText)
  ) {
    throw new Error(`Publication does not match scenario: ${lesson.lessonId}`)
  }
  return { scenario, publication }
}

const verifyLocalizedVideo = (
  lesson: Lesson,
  scenario: Scenario,
  publication: Publication,
  locale: 'ja' | 'en',
  readAsset: ReadAsset,
) => {
  const asset = lesson.assets.find(
    (entry) => entry.locale === locale && entry.status === 'available',
  )
  if (!asset?.posterPath || !asset.captionPaths) {
    throw new Error(`Missing ${locale} video: ${lesson.lessonId}`)
  }
  const video = readAsset(asset.path)
  if (
    video.length !== publication.assets[locale].bytes ||
    hash(video) !== publication.assets[locale].sha256
  ) {
    throw new Error(`Video differs from publication: ${asset.path}`)
  }
  if (
    asset.durationSeconds !==
    scenario.segments.reduce((sum, segment) => sum + segment.seconds, 0)
  ) {
    throw new Error(`Video duration differs from scenario: ${asset.path}`)
  }
  const poster = readAsset(asset.posterPath)
  if (Buffer.from(poster).subarray(0, 3).toString('hex') !== 'ffd8ff') {
    throw new Error(`Invalid poster: ${asset.posterPath}`)
  }
  for (const caption of ['ja', 'en'] as const) {
    const name = asset.captionPaths[caption]
    if (
      !name ||
      new TextDecoder().decode(readAsset(name)) !==
        captionsVtt(scenario, caption)
    ) {
      throw new Error(
        `Caption differs from scenario: ${lesson.lessonId} ${caption}`,
      )
    }
  }
}

const verifyPackagedAssets = (
  artifact: string,
  expectedAssets: ReadonlyMap<string, Uint8Array>,
) => {
  verifyAcademyArtifacts([artifact])
  const zip = statSync(artifact).isDirectory()
    ? null
    : unzipSync(readFileSync(artifact))
  for (const [name, bytes] of expectedAssets) {
    let packaged: Uint8Array | undefined
    try {
      packaged = zip ? zip[name] : readFileSync(path.join(artifact, name))
    } catch {
      // Report the missing entry consistently for ZIPs and directories.
    }
    if (!packaged || hash(packaged) !== hash(bytes)) {
      throw new Error(`Missing or changed packaged Academy asset: ${name}`)
    }
  }
}

export const verifyAcademyQuality = ({
  root = process.cwd(),
  lessons = ACADEMY_LESSONS,
  courses = ACADEMY_COURSES,
  messages = ACADEMY_MESSAGES,
  artifacts = [],
}: QualityOptions = {}) => {
  validateCatalog(courses, lessons)
  const targets = productionTargets(root)
  const requireTarget = (target: string) => {
    if (!targets.has(target)) {
      throw new Error(`Missing production data-tour: ${target}`)
    }
  }
  const guide = readFileSync(
    path.join(
      root,
      'src/features/academy/presentation/useScreenGuideController.ts',
    ),
    'utf8',
  )
  for (const match of guide.matchAll(/\[data-tour="([^"]+)"\]/gu)) {
    if (match[1]) {
      requireTarget(match[1])
    }
  }
  const expectedAssets = new Map<string, Uint8Array>()
  const readAsset: ReadAsset = (name) => {
    const bytes = readFileSync(path.join(root, 'src/public', name))
    if (bytes.length === 0) {
      throw new Error(`Empty Academy asset: ${name}`)
    }
    expectedAssets.set(name, bytes)
    return bytes
  }
  verifyTranslations(
    messages,
    courses.map((course) => course.titleKey),
  )
  for (const lesson of lessons) {
    lesson.steps.forEach((step) => {
      if (step.dataTour !== null) {
        requireTarget(step.dataTour)
      }
    })
    verifyTranslations(messages, [
      lesson.titleKey,
      lesson.descriptionKey,
      ...lesson.steps.map((step) => step.instructionKey),
    ])
    for (const locale of ['ja', 'en'] as const) {
      const textGuide = getAcademyGuide(lesson.lessonId, locale)
      if (textGuide.length === 0 || textGuide.some((text) => !text.trim())) {
        throw new Error(`Missing ${locale} text guide: ${lesson.lessonId}`)
      }
    }
    const { scenario, publication } = readLessonScenario(
      root,
      lesson,
      readAsset,
    )
    for (const locale of ['ja', 'en'] as const) {
      verifyLocalizedVideo(lesson, scenario, publication, locale, readAsset)
    }
  }
  artifacts.forEach((artifact) => {
    verifyPackagedAssets(artifact, expectedAssets)
  })
  return {
    lessons: lessons.length,
    videos: lessons.length * 2,
    artifacts: artifacts.length,
  }
}

if (import.meta.main) {
  console.log(
    JSON.stringify(verifyAcademyQuality({ artifacts: process.argv.slice(2) })),
  )
}
