import assert from 'node:assert/strict'

import {
  ACADEMY_LESSONS,
  ACADEMY_MESSAGES,
} from '@/features/academy/domain/academyCatalog'

import { createFirefoxPracticeUi } from './firefoxDomainPracticeSmoke'

type Commands = Parameters<typeof createFirefoxPracticeUi>[0]

const labels = {
  en: { video: 'Learn by video', load: 'Load video', captions: 'Captions' },
  ja: { video: '動画で学ぶ', load: '動画を読み込む', captions: '字幕' },
}

/** No render/capture: validate the published media and paths in Firefox's real DOM. */
export const runFirefoxAcademyQualitySmoke = async (
  command: Commands,
  origin: string,
) => {
  const { evaluate, clickText } = createFirefoxPracticeUi(command, origin)
  const baseline = await evaluate('return productionBoundary()')
  const beforeTabs = await evaluate(`
    return (await browser.tabs.query({})).map(({ id }) => id).sort((a, b) => a - b)
  `)
  const settings = await evaluate(
    'return (await browser.storage.local.get("userSettings")).userSettings',
  )
  const beforePractice = await evaluate<Record<string, unknown>>(`
    const { academyProgressV1 } = await browser.storage.local.get('academyProgressV1')
    return Object.fromEntries(Object.entries(academyProgressV1?.lessons ?? {})
      .map(([id, progress]) => [id, progress.practice]))
  `)
  const navigate = async (route: string) => {
    await command('/url', { url: `${origin}/app.html#${route}` })
  }
  await command('/window/rect', { width: 1280, height: 900 })
  let videoVariants = 0
  let lessonPaths = 0
  await (['en', 'ja'] as const).reduce(async (previousLanguage, language) => {
    await previousLanguage
    // WebDriver arguments keep translated strings and lesson IDs out of source.
    await evaluate(
      `
      const { userSettings } = await browser.storage.local.get('userSettings')
      await browser.storage.local.set({ userSettings: { ...userSettings, language: parameters[0] } })
    `,
      [language],
    )
    await ACADEMY_LESSONS.reduce(async (previousLesson, lesson) => {
      await previousLesson
      const title = ACADEMY_MESSAGES[language][lesson.titleKey]
      assert.ok(title)
      await navigate(`/academy/${lesson.lessonId}`)
      await evaluate(
        `
        await until(() => exact('main h1', parameters[0]))
        if (document.querySelector('video')) throw new Error('Video loaded before choosing video mode')
        const practice = exact('[role="tab"]', parameters[1])
        if (!practice || practice.disabled !== parameters[2]) throw new Error('Practice availability differs from the lesson contract')
      `,
        [
          title,
          language === 'en' ? 'Practice with samples' : 'サンプルで練習する',
          ![
            'parent-categories',
            'child-categories',
            'reorder-items',
            'restore-tabs',
          ].includes(lesson.lessonId),
        ],
      )
      await clickText('[role="tab"]', labels[language].video)
      await evaluate(`
        const poster = await until(() => document.querySelector('main img'))
        await eventually(() => poster.complete && poster.naturalWidth > 0)
        if (document.querySelector('video')) throw new Error('Video loaded before the explicit load action')
      `)
      await clickText('button', labels[language].load)
      const asset = lesson.assets.find((item) => item.locale === language)
      assert.ok(asset)
      const media = await evaluate<{
        duration: number
        decodedFrames: number
        captions: string[]
        rate: number
        volume: number
      }>(
        `
        const video = await until(() => document.querySelector('video'))
        await eventually(() => video.readyState >= 2)
        if (video.error || !video.paused || video.autoplay || !video.controls) throw new Error('Video must load paused with native controls')
        if (video.getAttribute('src') !== parameters[0]) throw new Error('Wrong localized video')
        const captions = document.querySelector('select[aria-label="' + parameters[1] + '"]')
        const languages = []
        for (const language of ['ja', 'en']) {
          captions.value = language
          captions.dispatchEvent(new Event('change', { bubbles: true }))
          await eventually(() => [...video.textTracks].some((track) => track.language === language && track.mode === 'showing' && track.cues?.length > 0))
          languages.push(language)
        }
        captions.value = 'off'
        captions.dispatchEvent(new Event('change', { bubbles: true }))
        await eventually(() => [...video.textTracks].every((track) => track.mode === 'disabled'))
        video.muted = true
        video.volume = 0.3
        video.playbackRate = 1.5
        await video.play()
        await eventually(() => video.currentTime > 0 && video.getVideoPlaybackQuality().totalVideoFrames > 0)
        video.pause()
        video.currentTime = video.duration / 2
        await eventually(() => !video.seeking && Math.abs(video.currentTime - video.duration / 2) < 0.1)
        return { duration: video.duration, decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames, captions: languages, rate: video.playbackRate, volume: video.volume }
      `,
        [asset.path, labels[language].captions],
      )
      assert.equal(media.duration, asset.durationSeconds)
      assert.ok(media.decodedFrames > 0)
      assert.deepEqual(media.captions, ['ja', 'en'])
      assert.equal(media.rate, 1.5)
      assert.equal(media.volume, 0.3)
      videoVariants += 1
      if (language === 'en') {
        await clickText('button', 'Skip this lesson')
        const skipped = await evaluate(
          `
          return eventually(async () => {
            const { academyProgressV1 } = await browser.storage.local.get('academyProgressV1')
            const progress = academyProgressV1?.lessons[parameters[0]]
            return progress?.skippedAt ? progress : null
          })
        `,
          [lesson.lessonId],
        )
        await command('/refresh', {})
        await evaluate(`await until(() => exact('main h1', parameters[0]))`, [
          title,
        ])
        assert.deepEqual(
          await evaluate(
            `
          return (await browser.storage.local.get('academyProgressV1')).academyProgressV1.lessons[parameters[0]]
        `,
            [lesson.lessonId],
          ),
          skipped,
        )
        await navigate('/academy')
        await clickText('main h3', title)
        await evaluate(`await until(() => exact('main h1', parameters[0]))`, [
          title,
        ])
        await clickText('button', 'Review from the beginning')
        await evaluate(`
          await until(() => !exact('button', 'Saving…'))
          if (document.querySelector('video')) throw new Error('Review automatically loaded video')
        `)
        lessonPaths += 1
      }
    }, Promise.resolve())
  }, Promise.resolve())
  // A few decoded frames and seeking cannot award video/practice completion.
  const independent = await evaluate(
    `
    const { academyProgressV1 } = await browser.storage.local.get('academyProgressV1')
    return Object.fromEntries(parameters[0].map((id) => {
      const progress = academyProgressV1.lessons[id]
      if (Object.values(progress.video.assets).some((asset) => asset.watchedAt !== null)) throw new Error('Short playback or seek marked a video watched')
      return [id, progress.practice]
    }))
  `,
    [ACADEMY_LESSONS.map((lesson) => lesson.lessonId)],
  )
  const expectedPractice = Object.fromEntries(
    ACADEMY_LESSONS.map((lesson) => [
      lesson.lessonId,
      beforePractice[lesson.lessonId] ?? {},
    ]),
  )
  assert.deepEqual(independent, expectedPractice)
  await evaluate(
    `await browser.storage.local.set({ userSettings: parameters[0] })`,
    [settings],
  )
  assert.deepEqual(await evaluate('return productionBoundary()'), baseline)
  assert.deepEqual(
    await evaluate(`
    return (await browser.tabs.query({})).map(({ id }) => id).sort((a, b) => a - b)
  `),
    beforeTabs,
  )
  return {
    lessonPaths,
    videoVariants,
    captionLanguages: ['ja', 'en'],
    noAutoplay: true,
    manualPlayback: true,
    progressIndependent: true,
    persistenceUnchanged: true,
    tabsUnchanged: true,
  }
}
