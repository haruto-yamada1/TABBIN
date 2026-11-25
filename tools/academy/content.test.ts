import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ACADEMY_LESSONS } from '@/features/academy/domain/academyCatalog'

import { captionsVtt } from './pipeline/artifacts'
import { parseScenario } from './pipeline/scenario'

const read = async (relative: string) => readFile(path.resolve(relative))

describe('packaged Academy curriculum', () => {
  it('provides the installation chapter and all seven requested operation chapters', () => {
    expect(ACADEMY_LESSONS.map((lesson) => lesson.lessonId)).toEqual([
      'install-extension',
      'pin-extension',
      'save-tabs',
      'domain-mode',
      'parent-categories',
      'child-categories',
      'reorder-items',
      'restore-tabs',
    ])
  })

  for (const lesson of ACADEMY_LESSONS) {
    it(`${lesson.lessonId} ships both offline videos, captions and a real poster matching its scenario`, async () => {
      const scenario = parseScenario(
        JSON.parse(
          (
            await read(`tools/academy/scenarios/${lesson.lessonId}.json`)
          ).toString(),
        ),
      )
      const seconds = scenario.segments.reduce(
        (sum, segment) => sum + segment.seconds,
        0,
      )
      await Promise.all(
        (['ja', 'en'] as const).map(async (locale) => {
          const asset = lesson.assets.find((item) => item.locale === locale)
          expect(asset?.status).toBe('available')
          if (!asset) {
            throw new Error('Localized video missing.')
          }
          const bytes = await read(`src/public/${asset.path}`)
          expect(bytes.subarray(4, 8).toString()).toBe('ftyp')
          expect(asset.durationSeconds).toBe(seconds)
          const caption = await read(
            `src/public/academy/videos/${lesson.lessonId}.${locale}.vtt`,
          )
          expect(caption.toString()).toBe(captionsVtt(scenario, locale))
          const manifest = JSON.parse(
            (
              await read(`src/public/academy/videos/${lesson.lessonId}.json`)
            ).toString(),
          )
          expect(manifest.version).toBe(scenario.version)
          expect(manifest.assets[locale].bytes).toBe(bytes.length)
          expect(manifest.assets[locale].sha256).toBe(
            createHash('sha256').update(bytes).digest('hex'),
          )
        }),
      )
      const poster = await read(
        `src/public/academy/videos/${lesson.lessonId}.poster.jpg`,
      )
      expect(poster.subarray(0, 3).toString('hex')).toBe('ffd8ff')
    })
  }
})
