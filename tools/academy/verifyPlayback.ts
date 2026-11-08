import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { chromium, expect, firefox } from '@playwright/test'
import type { Browser } from '@playwright/test'

import { createMediaResponse } from './mediaResponse'
import { createPlaybackAppData } from './playbackAppData'

const tracksReady = (video: HTMLElement | SVGElement) => {
  if (!(video instanceof HTMLVideoElement)) {
    throw new TypeError('Video missing.')
  }
  const showing = Array.from(video.textTracks).filter(
    (track) => track.mode === 'showing',
  )
  return (
    showing.length === 1 &&
    showing.every(
      (track) =>
        (track.cues?.length ?? 0) > 0 && (track.activeCues?.length ?? 0) > 0,
    )
  )
}

const { values } = parseArgs({
  options: { browser: { type: 'string' } },
  strict: true,
})
if (values.browser !== 'chromium' && values.browser !== 'firefox') {
  throw new Error('Use --browser chromium or --browser firefox.')
}
const browserName = values.browser
const root = path.resolve('src/public/academy/videos')
const output = path.resolve('recordings/academy/content-review')
await mkdir(output, { recursive: true })
const files = new Map<string, Buffer>(
  await Promise.all(
    (await readdir(root))
      .filter((file) => /\.(mp4|vtt)$/u.test(file))
      .map(
        async (file) =>
          [`/${file}`, await readFile(path.join(root, file))] as const,
      ),
  ),
)
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  const file = files.get(pathname)
  if (file) {
    response.setHeader(
      'Content-Type',
      pathname.endsWith('.mp4') ? 'video/mp4' : 'text/vtt; charset=utf-8',
    )
    const media = createMediaResponse(
      file,
      request.method === 'GET' ? request.headers.range : undefined,
    )
    response.writeHead(media.status, media.headers)
    response.end(media.body)
  } else if (pathname === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(
      '<!doctype html><meta charset="utf-8"><title>TABBIN Academy playback verification</title><style>body{margin:0;background:#102f38}video{width:100%;max-height:100vh}</style><video controls muted preload="metadata"></video>',
    )
  } else {
    response.writeHead(404)
    response.end()
  }
})
await new Promise<void>((resolve) => {
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
if (!address || typeof address === 'string') {
  throw new Error('Loopback server missing.')
}
const origin = `http://127.0.0.1:${address.port}`
let browser: Browser | undefined
const results: unknown[] = []
let appData: Awaited<ReturnType<typeof createPlaybackAppData>>
try {
  appData = await createPlaybackAppData(browserName, output)
  if (browserName === 'firefox') {
    if (!appData) {
      throw new Error('Firefox app-data isolation is unavailable.')
    }
    browser = await firefox.launch({
      ...(process.env.FIREFOX_EXECUTABLE_PATH
        ? { executablePath: process.env.FIREFOX_EXECUTABLE_PATH }
        : {}),
      env: appData.environment,
    })
  } else {
    browser = await chromium.launch({ channel: 'chromium' })
  }
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  })
  await context.route('**/*', async (route) => {
    if (route.request().url().startsWith(`${origin}/`)) {
      await route.continue()
    } else {
      await route.abort()
    }
  })
  const page = await context.newPage()
  const movies = [...files.keys()]
    .filter((file) => file.endsWith('.mp4'))
    .toSorted()
  if (movies.length !== 16) {
    throw new Error('Expected all 16 localized chapter videos.')
  }
  await movies.reduce(async (previous, movie) => {
    await previous
    await page.goto(origin)
    const chapter = movie.replace(/\.(ja|en)\.mp4$/u, '')
    await page.locator('video').evaluate(
      (video, source) => {
        if (!(video instanceof HTMLVideoElement)) {
          throw new TypeError('Video missing.')
        }
        video.src = source.movie
        for (const language of ['ja', 'en']) {
          const track = document.createElement('track')
          track.kind = 'captions'
          track.srclang = language
          track.src = `${source.chapter}.${language}.vtt`
          video.append(track)
        }
        for (const track of Array.from(video.textTracks)) {
          track.mode = track.language === 'ja' ? 'showing' : 'hidden'
        }
      },
      { movie, chapter },
    )
    await expect
      .poll(async () =>
        page.locator('video').evaluate((video) => {
          if (!(video instanceof HTMLVideoElement)) {
            throw new TypeError('Video missing.')
          }
          return video.readyState
        }),
      )
      .toBeGreaterThanOrEqual(2)
    await page.locator('video').evaluate(async (video) => {
      if (!(video instanceof HTMLVideoElement)) {
        throw new TypeError('Video missing.')
      }
      const media = video
      media.playbackRate = 1.5
      await media.play()
    })
    await expect
      .poll(async () =>
        page.locator('video').evaluate((video) => {
          if (!(video instanceof HTMLVideoElement)) {
            throw new TypeError('Video missing.')
          }
          return video.currentTime
        }),
      )
      .toBeGreaterThan(0)
    await page.locator('video').evaluate(async (video) => {
      if (!(video instanceof HTMLVideoElement)) {
        throw new TypeError('Video missing.')
      }
      const media = video
      media.pause()
      await new Promise<void>((resolve) => {
        media.addEventListener(
          'seeked',
          () => {
            resolve()
          },
          { once: true },
        )
        media.currentTime = 5
      })
    })
    await expect
      .poll(async () =>
        page.locator('video').evaluate((video) => {
          if (!(video instanceof HTMLVideoElement)) {
            throw new TypeError('Video missing.')
          }
          return video.currentTime
        }),
      )
      .toBeCloseTo(5, 1)
    await expect
      .poll(async () => page.locator('video').evaluate(tracksReady))
      .toBe(true)
    const state = await page.locator('video').evaluate((video) => {
      if (!(video instanceof HTMLVideoElement)) {
        throw new TypeError('Video missing.')
      }
      const media = video
      const data = {
        source: media.getAttribute('src'),
        error: media.error?.code ?? null,
        width: media.videoWidth,
        height: media.videoHeight,
        duration: media.duration,
        paused: media.paused,
        rate: media.playbackRate,
        seconds: media.currentTime,
        frames: media.getVideoPlaybackQuality().totalVideoFrames,
        cues: Array.from(media.textTracks, (track) => ({
          language: track.language,
          count: track.cues?.length,
          active: track.activeCues?.length,
        })),
      }
      for (const track of Array.from(media.textTracks)) {
        track.mode = track.language === 'en' ? 'showing' : 'disabled'
      }
      return data
    })
    await expect
      .poll(async () => page.locator('video').evaluate(tracksReady))
      .toBe(true)
    await page.locator('video').evaluate((video) => {
      if (!(video instanceof HTMLVideoElement)) {
        throw new TypeError('Video missing.')
      }
      for (const track of Array.from(video.textTracks)) {
        track.mode = 'disabled'
      }
    })
    expect(state.error).toBeNull()
    expect(state.width).toBe(1280)
    expect(state.height).toBe(720)
    expect(state.frames).toBeGreaterThan(0)
    expect(state.paused).toBe(true)
    expect(state.rate).toBe(1.5)
    if (movie === '/parent-categories.en.mp4') {
      await page.screenshot({
        path: path.join(output, `${browserName}-playback.png`),
      })
    }
    results.push(state)
  }, Promise.resolve())
  const report = {
    status: 'passed',
    browser: browserName,
    version: browser.version(),
    videos: results.length,
    results,
  }
  await writeFile(
    path.join(output, `${browserName}-playback.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(
    JSON.stringify({
      status: 'passed',
      browser: browserName,
      version: browser.version(),
      videos: results.length,
    }),
  )
} catch (error) {
  await writeFile(
    path.join(output, `${browserName}-playback-failure.json`),
    JSON.stringify({
      status: 'failed',
      error: String(error),
      completed: results.length,
    }),
  )
  throw error
} finally {
  try {
    await browser?.close()
  } finally {
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
    } finally {
      await appData?.cleanup()
    }
  }
}
