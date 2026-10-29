import { z } from 'zod'

const MAX_IDENTIFIER_LENGTH = 100
const MAX_TEXT_KEY_LENGTH = 160
const MAX_ASSET_PATH_LENGTH = 240
const MAX_VIDEO_SECONDS = 3600
const MAX_ESTIMATED_MINUTES = 180
const MAX_LESSON_ITEMS = 100
const MAX_LESSON_ASSETS = 8
const MAX_GENERATION_LENGTH = 128
const MAX_VIDEO_RANGES = 1000

const id = z
  .string()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
const key = z
  .string()
  .min(1)
  .max(MAX_TEXT_KEY_LENGTH)
  .regex(/^academy\.[a-zA-Z0-9.]+$/)
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const practiceRequirementSchema = z.strictObject({
  action: id,
  environment: z.literal('academy-sandbox'),
})
export const lessonStepSchema = z.strictObject({
  stepId: id,
  instructionKey: key,
  dataTour: id.nullable(),
  practiceRequirement: practiceRequirementSchema.nullable(),
})
export const lessonAssetSchema = z.strictObject({
  assetId: id,
  kind: z.literal('video'),
  locale: z.enum(['ja', 'en']),
  path: z
    .string()
    .max(MAX_ASSET_PATH_LENGTH)
    .regex(/^academy\/videos\/[a-z][a-z0-9-]*\.(ja|en)\.mp4$/),
  durationSeconds: z.number().positive().max(MAX_VIDEO_SECONDS),
  status: z.enum(['planned', 'available']),
})
export const lessonSchema = z.strictObject({
  lessonId: id,
  courseId: id,
  contentVersion: version,
  assessmentVersion: version,
  titleKey: key,
  descriptionKey: key,
  difficulty: z.enum(['beginner', 'intermediate']),
  estimatedMinutes: z.number().positive().max(MAX_ESTIMATED_MINUTES),
  prerequisiteLessonIds: z.array(id).max(MAX_LESSON_ITEMS),
  steps: z.array(lessonStepSchema).min(1).max(MAX_LESSON_ITEMS),
  assets: z.array(lessonAssetSchema).max(MAX_LESSON_ASSETS),
  mastery: z.strictObject({
    videoRequired: z.boolean(),
    practiceStepIds: z.array(id).max(MAX_LESSON_ITEMS),
  }),
})
export const courseSchema = z.strictObject({
  courseId: id,
  titleKey: key,
  lessonIds: z.array(id).min(1).max(MAX_LESSON_ITEMS),
})
const range = z
  .tuple([z.number().nonnegative(), z.number().positive()])
  .refine(([start, end]) => end > start)
export const lessonProgressSchema = z
  .strictObject({
    lessonId: id,
    contentVersion: version,
    assessmentVersion: version,
    generation: z.string().min(1).max(MAX_GENERATION_LENGTH),
    startedAt: timestamp.nullable(),
    skippedAt: timestamp.nullable(),
    video: z.strictObject({
      durationSeconds: z.number().positive().max(MAX_VIDEO_SECONDS).nullable(),
      ranges: z.array(range).max(MAX_VIDEO_RANGES),
      watchedAt: timestamp.nullable(),
    }),
    practice: z
      .record(id, timestamp)
      .refine((entries) => Object.keys(entries).length <= MAX_LESSON_ITEMS),
  })
  .refine((value) =>
    value.video.ranges.every(
      ([, end]) =>
        value.video.durationSeconds !== null &&
        end <= value.video.durationSeconds,
    ),
  )
export type Course = z.infer<typeof courseSchema>
export type Lesson = z.infer<typeof lessonSchema>
export type LessonStep = z.infer<typeof lessonStepSchema>
export type LessonAsset = z.infer<typeof lessonAssetSchema>
export type PracticeRequirement = z.infer<typeof practiceRequirementSchema>
export type LessonProgress = z.infer<typeof lessonProgressSchema>
