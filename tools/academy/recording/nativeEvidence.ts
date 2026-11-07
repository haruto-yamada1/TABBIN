import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { academyManifest } from '#academy-fixture'
import { z } from 'zod'

import { validateSaveFlow } from './contract'
import type { RecordingSource } from './contract'

const sourceSchema = z.enum(['chrome-web-store', 'unpacked-development'])
const browserSchema = z.enum(['chrome', 'chromium'])
const passedValidationSchema = z.object({
  status: z.literal('passed'),
  errors: z.array(z.string()).length(0),
})
const resultSchema = z.object({
  schemaVersion: z.literal(1),
  source: sourceSchema,
  browser: browserSchema,
  profileRemoved: z.literal(true),
  stage: z.literal('finished'),
  status: z.literal('pending-native-evidence'),
  failureCount: z.number().int().nonnegative(),
  saveFlow: passedValidationSchema,
})
const installationSchema = z.object({
  source: z.literal('chrome-web-store'),
  id: z.literal('dljblklbpmoocinnlcejeokopmfoldaj'),
  installType: z.literal('normal'),
  name: z.string().min(1),
  version: z.string().min(1),
  manifestVersion: z.number().int().positive(),
})
const tabSchema = z.object({
  id: z.number().int().nonnegative(),
  url: z.string().min(1),
  active: z.boolean(),
})
const afterSchema = z.object({
  source: sourceSchema,
  extensionId: z.literal('dljblklbpmoocinnlcejeokopmfoldaj'),
  expectedUrls: z.array(z.url()),
  beforeTabs: z.array(tabSchema),
  afterTabs: z.array(tabSchema),
  isOnToolbar: z.boolean(),
  clickBehavior: z.string(),
  snapshot: z.object({
    categories: z.array(z.record(z.string(), z.unknown())),
    groups: z.array(z.record(z.string(), z.unknown())),
    urls: z.array(z.looseObject({ id: z.string().min(1), url: z.url() })),
    collections: z.array(
      z.looseObject({
        id: z.string().min(1),
        definition: z.union([
          z.looseObject({ type: z.literal('domain'), domain: z.string() }),
          z.looseObject({ type: z.literal('custom') }),
        ]),
      }),
    ),
    memberships: z.array(
      z.looseObject({
        collectionId: z.string().min(1),
        urlId: z.string().min(1),
      }),
    ),
  }),
  validation: passedValidationSchema,
})
const clipSchema = z.object({
  stage: z.enum(['install', 'pin', 'save']),
  file: z.string().min(1),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/iu)
    .toLowerCase(),
  reviewed: z.literal(true),
})
const reviewSchema = z.object({
  os: z.string().trim().min(1),
  browser: browserSchema,
  source: sourceSchema,
  reviewedBy: z.string().trim().min(1),
  privacyReviewed: z.literal(true),
  authenticNativeUi: z.literal(true),
  clips: z
    .array(clipSchema)
    .length(3)
    .refine(
      (clips) => new Set(clips.map((clip) => clip.stage)).size === 3,
      'Review one clip for each of install, pin and save.',
    ),
})

type VerifiedClip = {
  stage: 'install' | 'pin' | 'save'
  file: string
  sha256: string
  bytes: number
  container: 'iso-bmff' | 'webm'
}

export type FinalRecordingResult = {
  schemaVersion: 1
  status: 'passed' | 'failed'
  source: RecordingSource | null
  browser: 'chrome' | 'chromium' | null
  failureCount: number | null
  finalizedAt: string
  errors: string[]
  review?: {
    os: string
    reviewedBy: string
    privacyReviewed: true
    authenticNativeUi: true
  }
  clips?: VerifiedClip[]
  installation?: z.output<typeof installationSchema>
}

const resolveRunFile = async (root: string, relativeFile: string) => {
  if (
    path.isAbsolute(relativeFile) ||
    path.win32.isAbsolute(relativeFile) ||
    relativeFile.includes('\\') ||
    relativeFile.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new Error(
      `Only paths inside the recording directory are allowed: ${relativeFile}`,
    )
  }
  const filename = await realpath(path.join(root, relativeFile))
  const relative = path.relative(root, filename)
  if (
    relative === '' ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`File escapes the recording directory: ${relativeFile}`)
  }
  const info = await stat(filename)
  if (!info.isFile() || info.size === 0) {
    throw new Error(`Expected a nonempty regular file: ${relativeFile}`)
  }
  return filename
}

const readRunJson = async <S extends z.ZodType>(
  root: string,
  name: string,
  schema: S,
): Promise<z.output<S>> => {
  const value: unknown = JSON.parse(
    await readFile(await resolveRunFile(root, name), 'utf8'),
  )
  return schema.parse(value)
}

const inspectClip = async (root: string, relativeFile: string) => {
  const filename = await resolveRunFile(root, relativeFile)
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await file.stat()
    if (!info.isFile()) {
      throw new Error(`Expected a regular video file: ${relativeFile}`)
    }
    const header = Buffer.alloc(32)
    const { bytesRead } = await file.read(header, 0, header.length, 0)
    if (bytesRead < 16) {
      throw new Error(`Video container is too short: ${relativeFile}`)
    }
    let container: VerifiedClip['container']
    if (header.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))) {
      container = 'webm'
    } else if (
      header.subarray(4, 8).toString('ascii') === 'ftyp' &&
      header.readUInt32BE(0) >= 16 &&
      header.readUInt32BE(0) <= info.size
    ) {
      container = 'iso-bmff'
    } else {
      throw new Error(
        `Expected a MOV/MP4 ftyp or WebM EBML header: ${relativeFile}`,
      )
    }
    const hash = createHash('sha256')
    for await (const chunk of file.createReadStream({
      start: 0,
      autoClose: false,
    })) {
      if (!Buffer.isBuffer(chunk)) {
        throw new TypeError('Unexpected video stream chunk.')
      }
      hash.update(chunk)
    }
    return { bytes: info.size, container, sha256: hash.digest('hex') }
  } finally {
    await file.close()
  }
}

const validateRun = (
  result: z.output<typeof resultSchema>,
  after: z.output<typeof afterSchema>,
  review: z.output<typeof reviewSchema>,
) => {
  if (
    result.source !== 'chrome-web-store' ||
    after.source !== result.source ||
    review.source !== result.source ||
    review.browser !== result.browser
  ) {
    throw new Error(
      'Install evidence requires a matching Chrome Web Store source and browser.',
    )
  }
  const expectedUrls = academyManifest.sites.flatMap((site) =>
    site.pages.map((page) => `https://${site.hostname}${page.path}`),
  )
  if (
    JSON.stringify(after.expectedUrls.toSorted()) !==
    JSON.stringify(expectedUrls.toSorted())
  ) {
    throw new Error(
      'The recording does not use the expected minimal Academy fixture.',
    )
  }
  const validation = validateSaveFlow(after)
  if (validation.status !== 'passed') {
    throw new Error(
      `Save evidence is invalid: ${validation.errors.join(', ')}.`,
    )
  }
}

const verifyReviewClips = async (
  root: string,
  review: z.output<typeof reviewSchema>,
) => {
  const inspected = new Map<string, ReturnType<typeof inspectClip>>()
  return Promise.all(
    review.clips.map(async (clip) => {
      let file = inspected.get(clip.file)
      if (!file) {
        file = inspectClip(root, clip.file)
        inspected.set(clip.file, file)
      }
      const verified = await file
      if (verified.sha256 !== clip.sha256) {
        throw new Error(
          `The reviewed video digest does not match: ${clip.file}`,
        )
      }
      return { stage: clip.stage, file: clip.file, ...verified }
    }),
  )
}

const appendAttempt = async (root: string, result: FinalRecordingResult) => {
  const file = await open(
    path.join(root, 'finalization-attempts.jsonl'),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_APPEND |
      constants.O_NOFOLLOW,
    0o600,
  )
  try {
    if (!(await file.stat()).isFile()) {
      throw new Error('Finalization attempt log must be a regular file.')
    }
    await file.writeFile(`${JSON.stringify(result)}\n`)
  } finally {
    await file.close()
  }
}

/** Revalidates an existing successful PoC without changing its original evidence. */
export const verifyFinalizedRecording = async (runDir: string) => {
  const root = await realpath(path.resolve(runDir))
  const [result, after, review, installation, finalized] = await Promise.all([
    readRunJson(root, 'result.json', resultSchema),
    readRunJson(root, 'after.json', afterSchema),
    readRunJson(root, 'native-review.json', reviewSchema),
    readRunJson(root, 'installation.json', installationSchema),
    readRunJson(
      root,
      'final-result.json',
      z.object({
        status: z.literal('passed'),
        source: sourceSchema,
        browser: browserSchema,
        installation: installationSchema,
        review: z.object({
          os: z.string(),
          reviewedBy: z.string(),
          privacyReviewed: z.literal(true),
          authenticNativeUi: z.literal(true),
        }),
        clips: z.array(
          z.object({
            stage: z.enum(['install', 'pin', 'save']),
            file: z.string(),
            sha256: z.string(),
            bytes: z.number(),
            container: z.enum(['iso-bmff', 'webm']),
          }),
        ),
      }),
    ),
  ])
  validateRun(result, after, review)
  const clips = await verifyReviewClips(root, review)
  if (
    finalized.source !== result.source ||
    finalized.browser !== result.browser ||
    !isDeepStrictEqual(finalized.clips, clips) ||
    !isDeepStrictEqual(finalized.installation, installation) ||
    finalized.review.os !== review.os ||
    finalized.review.reviewedBy !== review.reviewedBy
  ) {
    throw new Error(
      'Finalized recording no longer matches the reviewed evidence.',
    )
  }
  return { clips, installation, after, review: finalized.review }
}

export const finalizeRecording = async (
  runDir: string,
): Promise<FinalRecordingResult> => {
  const root = await realpath(path.resolve(runDir))
  const report: FinalRecordingResult = {
    schemaVersion: 1,
    status: 'failed',
    source: null,
    browser: null,
    failureCount: null,
    finalizedAt: new Date().toISOString(),
    errors: [],
  }
  try {
    const result = await readRunJson(root, 'result.json', resultSchema)
    report.source = result.source
    report.browser = result.browser
    report.failureCount = result.failureCount
    const [after, review, installation] = await Promise.all([
      readRunJson(root, 'after.json', afterSchema),
      readRunJson(root, 'native-review.json', reviewSchema),
      readRunJson(root, 'installation.json', installationSchema),
    ])
    validateRun(result, after, review)
    report.installation = installation
    report.clips = await verifyReviewClips(root, review)
    report.review = {
      os: review.os,
      reviewedBy: review.reviewedBy,
      privacyReviewed: review.privacyReviewed,
      authenticNativeUi: review.authenticNativeUi,
    }
    report.status = 'passed'
    await writeFile(
      path.join(root, 'final-result.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    )
  } catch (error) {
    report.status = 'failed'
    report.errors.push(error instanceof Error ? error.message : String(error))
  }
  await appendAttempt(root, report)
  return report
}
