import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { chromium } from '@playwright/test'
import { z } from 'zod'

import type { LessonScenario, Locale } from './scenario'

export type RenderLessonOptions = {
  scenario: LessonScenario
  locale: Locale
  runDir: string
  nativeClips: Partial<Record<'install' | 'pin' | 'save', string>>
  pageClip: string
  pageStartSeconds: number
  fontFile: string
}

type Segment = LessonScenario['segments'][number]
type PlannedSegment =
  | Extract<Segment, { kind: 'card' }>
  | (Exclude<Segment, { kind: 'card' }> & { file: string; start: number })

export const createRenderPlan = (options: RenderLessonOptions) => {
  if (
    !Number.isFinite(options.pageStartSeconds) ||
    options.pageStartSeconds < 0
  ) {
    throw new Error('The page preparation trim must be nonnegative and finite.')
  }
  const segments: PlannedSegment[] = options.scenario.segments.map(
    (segment) => {
      if (segment.kind === 'card') {
        return { ...segment }
      }
      const file =
        segment.kind === 'native'
          ? options.nativeClips[segment.stage]
          : options.pageClip
      if (!file || !path.isAbsolute(file)) {
        throw new Error(
          `Missing absolute ${segment.kind} ${segment.kind === 'native' ? segment.stage : 'page'} clip.`,
        )
      }
      return {
        ...segment,
        file,
        start:
          segment.start +
          (segment.kind === 'page' ? options.pageStartSeconds : 0),
      }
    },
  )
  return {
    seconds: segments.reduce((sum, segment) => sum + segment.seconds, 0),
    segments,
  }
}

export const escapeOverlayText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export const runMediaCommand = async (
  runDir: string,
  binary: string,
  args: string[],
): Promise<string> => {
  let executable = binary
  if (binary === 'ffmpeg') {
    executable = process.env.FFMPEG_PATH ?? binary
  } else if (binary === 'ffprobe') {
    executable = process.env.FFPROBE_PATH ?? binary
  }
  const logFile = path.join(runDir, 'render.log')
  await appendFile(logFile, `${JSON.stringify({ binary, args })}\n`)
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: runDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, 120_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      void appendFile(logFile, stderr).then(() => {
        if (timedOut || code !== 0) {
          reject(
            new Error(
              `${binary} failed: ${timedOut ? 'timeout' : String(code ?? signal)}. See render.log.`,
            ),
          )
        } else {
          resolve(stdout)
        }
      }, reject)
    })
  })
}

const videoDurationSchema = z.object({
  format: z.object({ duration: z.coerce.number().positive() }),
})
const probeSeconds = async (runDir: string, file: string) => {
  if (!(await stat(file)).isFile()) {
    throw new Error('Expected a regular source clip.')
  }
  const output = await runMediaCommand(runDir, 'ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    file,
  ])
  return videoDurationSchema.parse(JSON.parse(output)).format.duration
}

const createOverlays = async (options: RenderLessonOptions) => {
  const fontBytes = await readFile(options.fontFile)
  if (!fontBytes.length) {
    throw new Error('The provided overlay font is empty.')
  }
  const fontSha256 = createHash('sha256').update(fontBytes).digest('hex')
  const browser = await chromium.launch({ channel: 'chromium', headless: true })
  try {
    if (browser.version() !== options.scenario.browserVersion) {
      throw new Error(`Overlay browser version mismatch: ${browser.version()}.`)
    }
    const page = await browser.newPage({
      viewport: options.scenario.viewport,
      deviceScaleFactor: 1,
      locale: 'ja-JP',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    })
    await page.route('**/*', async (route) => route.abort())
    const fontCss = `@font-face{font-family:Academy;src:url(data:font/ttf;base64,${fontBytes.toString('base64')})}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent}body{font-family:Academy,sans-serif;color:white}`
    const screenshot = async (name: string, content: string) => {
      await page.setContent(
        `<!doctype html><html><meta charset="utf-8"><style>${fontCss}</style><body>${content}</body></html>`,
      )
      const loaded = await page.evaluate(async () => {
        await document.fonts.load('32px Academy')
        await document.fonts.ready
        return document.fonts.check('32px Academy')
      })
      if (!loaded) {
        throw new Error('The provided overlay font could not be loaded.')
      }
      await page.screenshot({
        path: path.join(options.runDir, name),
        omitBackground: true,
        animations: 'disabled',
      })
    }
    await options.scenario.segments.reduce(async (previous, segment, index) => {
      await previous
      if (segment.kind !== 'card') {
        return
      }
      await screenshot(
        `card-${index}.png`,
        `<main style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:90px;background:#102f38;border-top:12px solid #70e0bd"><p style="font-size:24px;color:#70e0bd;letter-spacing:4px">TABBIN ACADEMY</p><h1 style="font-size:48px;line-height:1.5;margin:22px 0">${escapeOverlayText(segment.title[options.locale])}</h1><p style="font-size:26px;line-height:1.6;color:#d8e9e6">${escapeOverlayText(segment.detail[options.locale])}</p></main>`,
      )
    }, Promise.resolve())
    await options.scenario.captions.reduce(async (previous, cue, index) => {
      await previous
      await screenshot(
        `caption-${index}.png`,
        `<aside style="position:absolute;left:40px;right:40px;bottom:22px;background:rgba(10,26,32,.94);border-left:5px solid #70e0bd;border-radius:8px;padding:16px 22px;font-size:25px;line-height:1.55;text-align:center">${escapeOverlayText(cue[options.locale])}</aside>`,
      )
    }, Promise.resolve())
    return { fontSha256, browserVersion: browser.version() }
  } finally {
    await browser.close()
  }
}

const commonEncodeArgs = [
  '-an',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '20',
  '-pix_fmt',
  'yuv420p',
  '-map_metadata',
  '-1',
  '-movflags',
  '+faststart',
]

export const renderLesson = async (
  options: RenderLessonOptions,
): Promise<{
  file: string
  tools: { ffmpeg: string; ffprobe: string; browserVersion: string }
  fontSha256: string
}> => {
  const plan = createRenderPlan(options)
  await mkdir(options.runDir, { recursive: true })
  // Source duration checks happen before rendering, so short native takes cannot
  // silently turn into shorter lessons when FFmpeg reaches end of input.
  const files = [
    ...new Set(
      plan.segments.flatMap((segment) =>
        segment.kind === 'card' ? [] : [segment.file],
      ),
    ),
  ]
  const durations = new Map(
    await Promise.all(
      files.map(
        async (file) =>
          [file, await probeSeconds(options.runDir, file)] as const,
      ),
    ),
  )
  for (const segment of plan.segments) {
    if (segment.kind === 'card') {
      continue
    }
    const duration = durations.get(segment.file)
    if (
      duration === undefined ||
      segment.start + segment.seconds > duration + 0.04
    ) {
      throw new Error(
        `Source clip is shorter than its requested trim: ${segment.file}.`,
      )
    }
  }
  const overlays = await createOverlays(options)
  const ffmpeg = await runMediaCommand(options.runDir, 'ffmpeg', ['-version'])
  const ffprobe = await runMediaCommand(options.runDir, 'ffprobe', ['-version'])
  const { width, height } = options.scenario.viewport
  await Promise.all(
    plan.segments.map(async (segment, index) => {
      const input =
        segment.kind === 'card'
          ? ['-loop', '1', '-i', `card-${index}.png`]
          : ['-ss', String(segment.start), '-i', segment.file]
      const zoom = segment.kind === 'card' ? 1 : segment.zoom
      const zoomWidth = Math.ceil((width * zoom) / 2) * 2
      const zoomHeight = Math.ceil((height * zoom) / 2) * 2
      const filter = [
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
        `scale=${zoomWidth}:${zoomHeight}`,
        `crop=${width}:${height}`,
        'setsar=1',
        `fps=${options.scenario.output.fps}`,
        'fade=t=in:st=0:d=0.15',
        `fade=t=out:st=${Math.max(0, segment.seconds - 0.15)}:d=0.15`,
      ].join(',')
      await runMediaCommand(options.runDir, 'ffmpeg', [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...input,
        '-t',
        String(segment.seconds),
        '-vf',
        filter,
        ...commonEncodeArgs,
        `segment-${index}.mp4`,
      ])
    }),
  )
  await writeFile(
    path.join(options.runDir, 'segments.txt'),
    `${plan.segments.map((_, index) => `file 'segment-${index}.mp4'`).join('\n')}\n`,
  )
  await runMediaCommand(options.runDir, 'ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '1',
    '-i',
    'segments.txt',
    '-c',
    'copy',
    '-map_metadata',
    '-1',
    'timeline.mp4',
  ])
  const captionInputs = options.scenario.captions.flatMap((_, index) => [
    '-loop',
    '1',
    '-i',
    `caption-${index}.png`,
  ])
  const filters = options.scenario.captions
    .map((cue, index) => {
      const source = index === 0 ? '[0:v]' : `[caption${index - 1}]`
      return `${source}[${index + 1}:v]overlay=0:0:enable='gte(t,${cue.start})*lt(t,${cue.end})'[caption${index}]`
    })
    .join(';')
  const output = path.join(options.runDir, options.scenario.output.filename)
  await runMediaCommand(options.runDir, 'ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    'timeline.mp4',
    ...captionInputs,
    '-filter_complex',
    filters,
    '-map',
    `[caption${options.scenario.captions.length - 1}]`,
    '-t',
    String(plan.seconds),
    ...commonEncodeArgs,
    '-r',
    String(options.scenario.output.fps),
    '-fps_mode',
    'cfr',
    output,
  ])
  return {
    file: output,
    tools: {
      ffmpeg: ffmpeg.split('\n')[0] ?? '',
      ffprobe: ffprobe.split('\n')[0] ?? '',
      browserVersion: overlays.browserVersion,
    },
    fontSha256: overlays.fontSha256,
  }
}
