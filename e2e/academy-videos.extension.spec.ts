import type { Locator, Page, TestInfo } from '@playwright/test'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readStorage,
  seedStorage,
  test,
} from './helpers/extension'

const chapters = [
  {
    id: 'install-extension',
    seconds: 30,
    en: 'Install TABBIN',
    ja: 'TABBINをインストール',
  },
  {
    id: 'pin-extension',
    seconds: 20,
    en: 'Pin the extension',
    ja: '拡張機能を固定',
  },
  {
    id: 'save-tabs',
    seconds: 27,
    en: 'Save tabs together',
    ja: 'タブをまとめて保存',
  },
  {
    id: 'domain-mode',
    seconds: 30,
    en: 'Explore Domain mode',
    ja: 'Domainモードを見る',
  },
  {
    id: 'parent-categories',
    seconds: 40,
    en: 'Organize parent categories',
    ja: '親カテゴリで整理',
  },
  {
    id: 'child-categories',
    seconds: 40,
    en: 'Organize child categories',
    ja: '子カテゴリで整理',
  },
  {
    id: 'reorder-items',
    seconds: 30,
    en: 'Change the order',
    ja: '表示順を変更',
  },
  {
    id: 'restore-tabs',
    seconds: 25,
    en: 'Restore saved tabs',
    ja: '保存タブを復元',
  },
]
const labels = {
  en: {
    video: 'Learn by video',
    load: 'Load video',
    poster: 'Lesson video preview',
    speed: 'Playback speed',
    text: 'Read the guide',
  },
  ja: {
    video: '動画で学ぶ',
    load: '動画を読み込む',
    poster: '教材動画のプレビュー',
    speed: '再生速度',
    text: 'テキストで学ぶ',
  },
}
const videoState = async (video: Locator) =>
  video.evaluate((element) => {
    if (!(element instanceof HTMLVideoElement)) {
      throw new TypeError('Expected the real video element')
    }
    return {
      ready: element.readyState,
      duration: element.duration,
      width: element.videoWidth,
      height: element.videoHeight,
      error: element.error?.code ?? null,
      paused: element.paused,
      position: element.currentTime,
      rate: element.playbackRate,
      decodedFrames: element.getVideoPlaybackQuality().totalVideoFrames,
      tracks: Array.from(element.textTracks, (track) => ({
        language: track.language,
        mode: track.mode,
        cues: track.cues?.length ?? 0,
      })),
    }
  })

const capturePlayerScreenshot = async (
  page: Page,
  testInfo: TestInfo,
  locale: string,
  chapter: string,
) => {
  if (locale !== 'en' || chapter !== 'parent-categories') {
    return
  }
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 1280, height: 1440 })
  await page
    .getByRole('heading', { name: 'Organize parent categories', exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('academy-player.png'),
    fullPage: true,
  })
  if (viewport) {
    await page.setViewportSize(viewport)
  }
}

for (const locale of ['ja', 'en'] as const) {
  test(`Academy offline ${locale} videos decode all eight chapters and support pause, speed and seek`, async ({
    page,
    extensionId,
    serviceWorker,
  }, testInfo) => {
    const seed = createBaseSeed()
    await seedStorage(serviceWorker, {
      ...seed,
      userSettings: { ...seed.userSettings, language: locale },
    })
    const requestedMedia: string[] = []
    page.on('request', (request) => {
      if (/\.(mp4|vtt)(?:\?|$)/u.test(request.url())) {
        requestedMedia.push(request.url())
      }
    })
    await page.goto(getExtensionUrl(extensionId, 'app.html#/academy'))
    await Promise.all(
      chapters.map(async (chapter) => {
        await expect(
          page.getByRole('link', { name: chapter[locale], exact: true }),
        ).toBeVisible()
      }),
    )
    expect(requestedMedia).toEqual([])
    await chapters.reduce(async (previous, chapter) => {
      await previous

      await test.step(chapter.id, async () => {
        await page.goto(
          getExtensionUrl(extensionId, `app.html#/academy/${chapter.id}`),
        )
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: chapter[locale],
            exact: true,
          }),
        ).toBeVisible()
        await expect(page.locator('video')).toHaveCount(0)
        await page
          .getByRole('tab', { name: labels[locale].video, exact: true })
          .click()
        await expect(page.locator('video')).toHaveCount(0)
        const poster = page.getByRole('img', {
          name: labels[locale].poster,
          exact: true,
        })
        await expect(poster).toBeVisible()
        await expect
          .poll(async () =>
            poster.evaluate(
              (image) =>
                image instanceof HTMLImageElement && image.naturalWidth > 0,
            ),
          )
          .toBe(true)
        await page
          .getByRole('button', { name: labels[locale].load, exact: true })
          .click()
        const video = page.locator('video')
        await expect(video).toHaveAttribute(
          'src',
          `academy/videos/${chapter.id}.${locale}.mp4`,
        )
        await expect(video).toHaveAttribute(
          'poster',
          `academy/videos/${chapter.id}.poster.jpg`,
        )
        await expect(video).toHaveAttribute('preload', 'metadata')
        await expect(video).toHaveAttribute('controls', '')
        await expect(video).not.toHaveAttribute('autoplay')
        await Promise.all(
          ['ja', 'en'].map(async (caption) => {
            await expect(
              video.locator(`track[srclang="${caption}"]`),
            ).toHaveAttribute(
              'src',
              `academy/videos/${chapter.id}.${caption}.vtt`,
            )
          }),
        )
        await expect
          .poll(async () => (await videoState(video)).ready)
          .toBeGreaterThanOrEqual(2)
        const metadata = await videoState(video)
        expect(metadata.error).toBeNull()
        expect(metadata.duration).toBeCloseTo(chapter.seconds, 1)
        expect(metadata.width).toBeGreaterThan(0)
        expect(metadata.height).toBeGreaterThan(0)
        expect(metadata.paused).toBe(true)
        await page
          .getByLabel(labels[locale].speed, { exact: true })
          .selectOption('1.5')
        await video.evaluate(async (element) => {
          if (!(element instanceof HTMLVideoElement)) {
            throw new TypeError('Expected video')
          }
          await element.play()
        })
        await expect
          .poll(async () => (await videoState(video)).position)
          .toBeGreaterThan(0)
        await video.evaluate((element) => {
          if (!(element instanceof HTMLVideoElement)) {
            throw new TypeError('Expected video')
          }
          element.pause()
        })
        const played = await videoState(video)
        expect(played.decodedFrames).toBeGreaterThan(0)
        expect(played.paused).toBe(true)
        expect(played.rate).toBe(1.5)
        await video.evaluate(async (element) => {
          if (!(element instanceof HTMLVideoElement)) {
            throw new TypeError('Expected video')
          }
          await new Promise<void>((resolve) => {
            element.addEventListener('seeked', () => resolve(), { once: true })
            element.currentTime = element.duration / 2
          })
        })
        expect((await videoState(video)).position).toBeCloseTo(
          chapter.seconds / 2,
          1,
        )
        await capturePlayerScreenshot(page, testInfo, locale, chapter.id)
        await page
          .getByRole('tab', { name: labels[locale].text, exact: true })
          .click()
        await expect(page.locator('video')).toHaveCount(0)
      })
    }, Promise.resolve())
    const progress = await readStorage<{
      academyProgressV1?: {
        lessons: Record<
          string,
          { video: { assets: Record<string, { watchedAt: number | null }> } }
        >
      }
    }>(serviceWorker, 'academyProgressV1')
    expect(
      Object.keys(progress.academyProgressV1?.lessons ?? {}).toSorted(),
    ).toEqual(chapters.map((chapter) => chapter.id).toSorted())
    expect(
      Object.values(progress.academyProgressV1?.lessons ?? {})
        .flatMap((lesson) => Object.values(lesson.video.assets))
        .every((asset) => asset.watchedAt === null),
    ).toBe(true)
  })
}

test('Academy captions switch between Japanese, English and off and language changes preserve the lesson', async ({
  page,
  extensionId,
  serviceWorker,
}, testInfo) => {
  await seedStorage(serviceWorker, createBaseSeed())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/academy/pin-extension'),
  )
  await page.getByRole('tab', { name: 'Learn by video', exact: true }).click()
  await page.getByRole('button', { name: 'Load video', exact: true }).click()
  const video = page.locator('video')
  await expect
    .poll(async () => (await videoState(video)).ready)
    .toBeGreaterThanOrEqual(2)
  const captions = page.getByLabel('Captions', { exact: true })
  await ['ja', 'en'].reduce(async (previous, language) => {
    await previous
    await captions.selectOption(language)
    await expect
      .poll(async () =>
        (await videoState(video)).tracks
          .filter((track) => track.mode === 'showing')
          .map((track) => track.language),
      )
      .toEqual([language])
    await expect
      .poll(
        async () =>
          (await videoState(video)).tracks.find(
            (track) => track.language === language,
          )?.cues ?? 0,
      )
      .toBeGreaterThan(0)
  }, Promise.resolve())
  await captions.selectOption('off')
  expect(
    (await videoState(video)).tracks.every(
      (track) => track.mode === 'disabled',
    ),
  ).toBe(true)
  await serviceWorker.evaluate(async () => {
    const { userSettings } = await chrome.storage.local.get('userSettings')
    await chrome.storage.local.set({
      userSettings: { ...userSettings, language: 'ja' },
    })
  })
  await expect(
    page.getByRole('heading', { name: '拡張機能を固定', exact: true }),
  ).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
  await page
    .getByRole('button', { name: '動画を読み込む', exact: true })
    .click()
  await expect(video).toHaveAttribute(
    'src',
    'academy/videos/pin-extension.ja.mp4',
  )
  await expect
    .poll(async () => (await videoState(video)).ready)
    .toBeGreaterThanOrEqual(2)
  expect((await videoState(video)).paused).toBe(true)
  await expect(page.getByLabel('字幕', { exact: true })).toHaveValue('ja')
  await expect(page.getByText('完了条件', { exact: true })).toBeVisible()
  await testInfo.attach('academy-video-ja', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  await page.getByRole('tab', { name: 'テキストで学ぶ', exact: true }).click()
  await expect(page.locator('video')).toHaveCount(0)
})
