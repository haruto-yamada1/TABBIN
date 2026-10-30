import { z } from 'zod'

import { emptyAcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import type {
  AcademyProgressRepository,
  AcademyState,
} from '@/features/academy/domain/AcademyProgressRepository'
import {
  lessonProgressSchema,
  videoEvidenceSchema,
} from '@/features/academy/domain/academySchemas'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

export const ACADEMY_PROGRESS_KEY = 'academyProgressV1'
export const ACADEMY_PROGRESS_LOCK = 'tabbin:academy-progress:v1'
export const ACADEMY_PROGRESS_MAX_BYTES = 524288
const MAX_LESSONS = 256

export type AcademyPersistenceErrorCode =
  | 'UNAVAILABLE'
  | 'INVALID_STATE'
  | 'UNSUPPORTED_SCHEMA'
  | 'COORDINATION_UNAVAILABLE'
  | 'WRITE_FAILED'
  | 'READ_FAILED'

export class AcademyPersistenceError extends Error {
  readonly code: AcademyPersistenceErrorCode

  constructor(code: AcademyPersistenceErrorCode) {
    super(`Academy persistence: ${code}`)
    this.name = 'AcademyPersistenceError'
    this.code = code
  }
}

type Storage = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (value: Record<string, unknown>) => Promise<void>
}

type Dependencies = {
  storage?: Storage
  runExclusive?: <T>(operation: () => Promise<T>) => Promise<T>
}

const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const stateSchema = z.strictObject({
  schemaVersion: z.literal(2),
  lessons: z.record(z.string(), lessonProgressSchema),
  intro: z.strictObject({
    dismissedAt: timestamp.nullable(),
    skippedAt: timestamp.nullable(),
  }),
})
// v1 had no asset identity. Keep its evidence separate; never merge it into a language asset.
const legacyStateSchema = stateSchema.extend({
  schemaVersion: z.literal(1),
  lessons: z.record(
    z.string(),
    lessonProgressSchema.extend({ video: videoEvidenceSchema }),
  ),
})
const decodeState = (value: unknown): AcademyState => {
  const current = stateSchema.safeParse(value)
  if (current.success) {
    return current.data
  }
  const legacy = legacyStateSchema.safeParse(value)
  if (!legacy.success) {
    throw new AcademyPersistenceError('INVALID_STATE')
  }
  return {
    ...legacy.data,
    schemaVersion: 2,
    lessons: Object.fromEntries(
      Object.entries(legacy.data.lessons).map(([id, progress]) => [
        id,
        { ...progress, video: { assets: {}, legacy: progress.video } },
      ]),
    ),
  }
}
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor'])
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null)

const serialize = (value: unknown): string => {
  try {
    const serialized = JSON.stringify(value)
    if (
      new TextEncoder().encode(serialized).length > ACADEMY_PROGRESS_MAX_BYTES
    ) {
      throw new AcademyPersistenceError('INVALID_STATE')
    }
    return serialized
  } catch {
    throw new AcademyPersistenceError('INVALID_STATE')
  }
}

const parse = (value: unknown, allowMissing = false): AcademyState => {
  if (value === undefined && allowMissing) {
    return emptyAcademyState()
  }
  if (
    isRecord(value) &&
    typeof value.schemaVersion === 'number' &&
    Number.isSafeInteger(value.schemaVersion) &&
    value.schemaVersion > 2
  ) {
    throw new AcademyPersistenceError('UNSUPPORTED_SCHEMA')
  }
  serialize(value)
  if (
    !isPlainRecord(value) ||
    !isPlainRecord(value.lessons) ||
    Object.keys(value.lessons).length > MAX_LESSONS ||
    Object.entries(value.lessons).some(
      ([lessonId, progress]) =>
        forbiddenKeys.has(lessonId) ||
        !isPlainRecord(progress) ||
        !isPlainRecord(progress.practice) ||
        !isPlainRecord(progress.video) ||
        (value.schemaVersion === 2 && !isPlainRecord(progress.video.assets)) ||
        Object.keys(progress.practice).some((key) => forbiddenKeys.has(key)),
    )
  ) {
    throw new AcademyPersistenceError('INVALID_STATE')
  }
  const result = decodeState(value)
  if (
    Object.entries(result.lessons).some(
      ([lessonId, progress]) =>
        lessonId !== progress.lessonId ||
        Object.keys(progress.video.assets).some((key) =>
          forbiddenKeys.has(key),
        ),
    )
  ) {
    throw new AcademyPersistenceError('INVALID_STATE')
  }
  return result
}

const isLockManager = (value: unknown): value is LockManager =>
  isRecord(value) && typeof Reflect.get(value, 'request') === 'function'

const withLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  const navigatorValue: unknown = Reflect.get(globalThis, 'navigator')
  const locks: unknown = isRecord(navigatorValue)
    ? Reflect.get(navigatorValue, 'locks')
    : undefined
  if (!isLockManager(locks)) {
    throw new AcademyPersistenceError('COORDINATION_UNAVAILABLE')
  }
  return locks.request(ACADEMY_PROGRESS_LOCK, { mode: 'exclusive' }, operation)
}

export const createChromeAcademyProgressRepository = (
  deps: Dependencies = {},
): AcademyProgressRepository => {
  const storage = (): Storage => {
    const value = deps.storage ?? getChromeStorageLocal()
    if (!value) {
      throw new AcademyPersistenceError('UNAVAILABLE')
    }
    return value
  }
  const readRaw = async (): Promise<unknown> => {
    const local = storage()
    try {
      const values = await local.get(ACADEMY_PROGRESS_KEY)
      return Object.hasOwn(values, ACADEMY_PROGRESS_KEY)
        ? values[ACADEMY_PROGRESS_KEY]
        : undefined
    } catch {
      throw new AcademyPersistenceError('READ_FAILED')
    }
  }
  return {
    read: async () => parse(await readRaw(), true),
    exportRaw: readRaw,
    update: async (change) => {
      const coordination = { entered: false }
      try {
        return await (deps.runExclusive ?? withLock)(async () => {
          coordination.entered = true
          const previous = parse(await readRaw(), true)
          const previousJson = serialize(previous)
          const next = parse(change(previous))
          if (serialize(next) !== previousJson) {
            const local = deps.storage ?? getChromeStorageLocal()
            if (!local) {
              throw new AcademyPersistenceError('UNAVAILABLE')
            }
            try {
              await local.set({ [ACADEMY_PROGRESS_KEY]: next })
            } catch {
              throw new AcademyPersistenceError('WRITE_FAILED')
            }
          }
          return next
        })
      } catch (error) {
        if (!coordination.entered) {
          throw new AcademyPersistenceError('COORDINATION_UNAVAILABLE')
        }
        throw error
      }
    },
  }
}
