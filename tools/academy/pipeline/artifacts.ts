import { createHash } from 'node:crypto'
import {
  appendFile,
  readFile,
  rename,
  stat,
  writeFile,
  mkdir,
} from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { runMediaCommand } from './render'
import type { LessonScenario, Locale } from './scenario'

export const digest = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex')
export const fileDigest = async (file: string) => digest(await readFile(file))

const timestamp = (seconds: number) => {
  const milliseconds = Math.round(seconds * 1000)
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`
}
export const captionsVtt = (scenario: LessonScenario, locale: Locale) =>
  `WEBVTT\n\n${scenario.captions.map((cue) => `${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue[locale]}\n`).join('\n')}`

const probeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      codec_name: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      pix_fmt: z.string().optional(),
      avg_frame_rate: z.string().optional(),
    }),
  ),
  format: z.object({ duration: z.string(), format_name: z.string() }),
})

const frameRate = (value: string | undefined) => {
  const match = value?.match(/^(\d+)\/(\d+)$/u)
  const numerator = Number(match?.[1])
  const denominator = Number(match?.[2])
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    throw new Error('Video frame rate contract failed.')
  }
  return numerator / denominator
}

export const validateVideoProbe = (
  value: unknown,
  scenario: LessonScenario,
) => {
  const probe = probeSchema.parse(value)
  const video = probe.streams[0]
  if (probe.streams.length !== 1 || video?.codec_type !== 'video') {
    throw new Error(
      'Exactly one video stream and muted audio are required by the output contract.',
    )
  }
  if (
    video.codec_name !== 'h264' ||
    video.pix_fmt !== 'yuv420p' ||
    video.width !== scenario.viewport.width ||
    video.height !== scenario.viewport.height
  ) {
    throw new Error('Video codec or dimensions contract failed.')
  }
  if (Math.abs(frameRate(video.avg_frame_rate) - scenario.output.fps) > 0.01) {
    throw new Error('Video frame rate contract failed.')
  }
  if (!probe.format.format_name.split(',').includes('mp4')) {
    throw new Error('Video container contract failed.')
  }
  const durationSeconds = Number(probe.format.duration)
  const expectedDuration = scenario.segments.reduce(
    (sum, segment) => sum + segment.seconds,
    0,
  )
  if (
    !Number.isFinite(durationSeconds) ||
    Math.abs(durationSeconds - expectedDuration) > 0.15
  ) {
    throw new Error('Video duration contract failed.')
  }
  return {
    durationSeconds,
    codec: video.codec_name,
    width: video.width,
    height: video.height,
  }
}

const verifySubtitles = async (runDir: string, scenario: LessonScenario) => {
  const entries = await Promise.all(
    (['ja', 'en'] as const).map(async (locale) => {
      const subtitle = path.join(runDir, `${scenario.id}.${locale}.vtt`)
      const content = await readFile(subtitle, 'utf8')
      if (content !== captionsVtt(scenario, locale)) {
        throw new Error(`Subtitle timing/content mismatch: ${locale}`)
      }
      return [locale, digest(content)] as const
    }),
  )
  return Object.fromEntries(entries)
}

export const verifyLessonArtifacts = async (
  runDir: string,
  scenario: LessonScenario,
) => {
  const file = path.join(runDir, scenario.output.filename)
  const info = await stat(file)
  if (
    !info.isFile() ||
    info.size <= 0 ||
    info.size > scenario.output.maxBytes
  ) {
    throw new Error('Video is empty or exceeds the configured size budget.')
  }
  const stdout = await runMediaCommand(runDir, 'ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    file,
  ])
  const metadata = validateVideoProbe(JSON.parse(stdout), scenario)
  try {
    await runMediaCommand(runDir, 'ffmpeg', [
      '-v',
      'error',
      '-xerror',
      '-i',
      file,
      '-map',
      '0:v:0',
      '-f',
      'null',
      '-',
    ])
  } catch (error) {
    await appendFile(path.join(runDir, 'decode-errors.log'), String(error))
    throw new Error('Full video decode failed.', { cause: error })
  }
  const [subtitles, videoSha256] = await Promise.all([
    verifySubtitles(runDir, scenario),
    fileDigest(file),
  ])
  return {
    status: 'passed',
    bytes: info.size,
    ...metadata,
    videoSha256,
    subtitles,
  }
}

/** Immutable bundles and a single atomic pointer preserve the last good take. */
export const promoteVerifiedBundle = async (
  runDir: string,
  releaseRoot: string,
  verify: () => unknown,
) => {
  const verification = await verify()
  await mkdir(releaseRoot, { recursive: true })
  const destination = path.join(releaseRoot, path.basename(runDir))
  await rename(runDir, destination)
  const temporaryPointer = path.join(
    releaseRoot,
    `.latest-${path.basename(runDir)}.json`,
  )
  await writeFile(
    temporaryPointer,
    JSON.stringify({ directory: path.basename(runDir), verification }, null, 2),
    { flag: 'wx' },
  )
  await rename(temporaryPointer, path.join(releaseRoot, 'latest.json'))
  return destination
}
