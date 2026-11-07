import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import saveTabs from '#academy-save-scenario'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  captionsVtt,
  digest,
  promoteVerifiedBundle,
  verifyLessonArtifacts,
} from './artifacts'
import * as media from './render'
import { parseScenario } from './scenario'

const temporary: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporary
      .splice(0)
      .map(async (dir) => rm(dir, { force: true, recursive: true })),
  )
})
const directory = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'academy-artifacts-'))
  temporary.push(dir)
  return dir
}

describe('Academy verified output', () => {
  it('writes aligned Japanese and English WebVTT timing from the edit timeline', () => {
    const scenario = parseScenario(saveTabs)
    expect(captionsVtt(scenario, 'ja')).toContain(
      '00:00:03.000 --> 00:00:07.000',
    )
    expect(captionsVtt(scenario, 'en')).toContain(
      'The pinned TABBIN icon saves and closes six real tabs',
    )
  })

  it('rejects empty/nonvideo output instead of promoting an invalid take', async () => {
    const dir = await directory()
    await writeFile(path.join(dir, saveTabs.output.filename), '')
    await expect(
      verifyLessonArtifacts(dir, parseScenario(saveTabs)),
    ).rejects.toThrow(/empty|size/iu)
  })

  it('preserves the previous pointer and all failed diagnostics when verification fails', async () => {
    const releaseRoot = await directory()
    const runDir = await directory()
    const previous = JSON.stringify({ directory: 'known-good' })
    await writeFile(path.join(releaseRoot, 'latest.json'), previous)
    await writeFile(path.join(runDir, 'trace.zip'), 'failure diagnostic')
    await expect(
      promoteVerifiedBundle(runDir, releaseRoot, async () => {
        throw new Error('decode failed')
      }),
    ).rejects.toThrow('decode failed')
    expect(await readFile(path.join(releaseRoot, 'latest.json'), 'utf8')).toBe(
      previous,
    )
    expect(await readFile(path.join(runDir, 'trace.zip'), 'utf8')).toBe(
      'failure diagnostic',
    )
  })

  it('promotes only after verification succeeds and updates an atomic pointer', async () => {
    const releaseRoot = await directory()
    const runDir = await directory()
    await writeFile(path.join(runDir, 'verified.txt'), 'complete')
    const result = await promoteVerifiedBundle(runDir, releaseRoot, () => ({
      passed: true,
    }))
    expect(await readFile(path.join(result, 'verified.txt'), 'utf8')).toBe(
      'complete',
    )
    expect(
      JSON.parse(await readFile(path.join(releaseRoot, 'latest.json'), 'utf8')),
    ).toMatchObject({
      directory: path.basename(runDir),
      verification: { passed: true },
    })
  })
})

const scenario = parseScenario(saveTabs)
const encodedVideo = 'encoded-video-test-double'
const videoStream = {
  codec_type: 'video',
  codec_name: 'h264',
  width: 1280,
  height: 720,
  pix_fmt: 'yuv420p',
  avg_frame_rate: '30/1',
}
const validProbe = {
  streams: [videoStream],
  format: { duration: '27.000000', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
}
const preparedOutput = async () => {
  const dir = await directory()
  await Promise.all([
    writeFile(path.join(dir, scenario.output.filename), encodedVideo),
    ...(['ja', 'en'] as const).map(async (locale) =>
      writeFile(
        path.join(dir, `${scenario.id}.${locale}.vtt`),
        captionsVtt(scenario, locale),
      ),
    ),
  ])
  return dir
}
const mockMedia = (probe: unknown = validProbe, decodeError?: Error) =>
  vi
    .spyOn(media, 'runMediaCommand')
    .mockImplementation(async (_runDir, binary) => {
      if (binary === 'ffprobe') {
        return JSON.stringify(probe)
      }
      if (decodeError) {
        throw decodeError
      }
      return ''
    })

describe('Encoded lesson verification boundaries', () => {
  it('verifies metadata, full decoding and both sidecars before returning hashes', async () => {
    const dir = await preparedOutput()
    const command = mockMedia()
    await expect(verifyLessonArtifacts(dir, scenario)).resolves.toMatchObject({
      status: 'passed',
      durationSeconds: 27,
      codec: 'h264',
      width: 1280,
      height: 720,
      videoSha256: digest(encodedVideo),
      subtitles: {
        ja: digest(captionsVtt(scenario, 'ja')),
        en: digest(captionsVtt(scenario, 'en')),
      },
    })
    expect(command.mock.calls.map((call) => call[1])).toEqual([
      'ffprobe',
      'ffmpeg',
    ])
  })

  it.each([
    [
      'wrong duration',
      { ...validProbe, format: { ...validProbe.format, duration: '25' } },
    ],
    [
      'wrong dimensions',
      { ...validProbe, streams: [{ ...videoStream, width: 640 }] },
    ],
    [
      'wrong codec',
      { ...validProbe, streams: [{ ...videoStream, codec_name: 'vp9' }] },
    ],
    [
      'wrong frame rate',
      { ...validProbe, streams: [{ ...videoStream, avg_frame_rate: '25/1' }] },
    ],
    [
      'zero frame denominator',
      { ...validProbe, streams: [{ ...videoStream, avg_frame_rate: '30/0' }] },
    ],
    [
      'audio in muted output',
      {
        ...validProbe,
        streams: [videoStream, { codec_type: 'audio', codec_name: 'aac' }],
      },
    ],
    [
      'multiple video streams',
      { ...validProbe, streams: [videoStream, videoStream] },
    ],
    [
      'container substring',
      {
        ...validProbe,
        format: { ...validProbe.format, format_name: 'notmp4' },
      },
    ],
  ])('rejects %s before decoding or promotion', async (_name, probe) => {
    const dir = await preparedOutput()
    const command = mockMedia(probe)
    await expect(verifyLessonArtifacts(dir, scenario)).rejects.toThrow(
      /contract|container|stream|duration|frame|codec|dimensions/iu,
    )
    expect(command.mock.calls.map((call) => call[1])).toEqual(['ffprobe'])
  })

  it('retains decoder failure evidence and rejects a corrupt encoded video', async () => {
    const dir = await preparedOutput()
    mockMedia(validProbe, new Error('corrupt frame 12'))
    await expect(verifyLessonArtifacts(dir, scenario)).rejects.toThrow(
      'Full video decode failed.',
    )
    expect(
      await readFile(path.join(dir, 'decode-errors.log'), 'utf8'),
    ).toContain('corrupt frame 12')
  })

  it.each(['ja', 'en'] as const)(
    'rejects a misaligned %s sidecar',
    async (locale) => {
      const dir = await preparedOutput()
      mockMedia()
      await writeFile(
        path.join(dir, `${scenario.id}.${locale}.vtt`),
        captionsVtt(scenario, locale).replace('00:00:03.000', '00:00:03.500'),
      )
      await expect(verifyLessonArtifacts(dir, scenario)).rejects.toThrow(
        `Subtitle timing/content mismatch: ${locale}`,
      )
    },
  )
})
