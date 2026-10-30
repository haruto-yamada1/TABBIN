import { afterEach, describe, expect, it, vi } from 'vitest'

import { emptyAcademyState } from '@/features/academy/domain/AcademyProgressRepository'
import type { LessonProgress } from '@/features/academy/domain/academySchemas'
import {
  ACADEMY_PROGRESS_KEY,
  ACADEMY_PROGRESS_LOCK,
  ACADEMY_PROGRESS_MAX_BYTES,
  AcademyPersistenceError,
  createChromeAcademyProgressRepository,
} from '@/features/academy/infrastructure/ChromeAcademyProgressRepository'

const chromeStorage = vi.hoisted(() => ({
  getLocal: vi.fn<() => unknown>(() => null),
}))
vi.mock('@/lib/browser/chrome-storage', () => ({
  getChromeStorageLocal: chromeStorage.getLocal,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const progress = (lessonId = 'unknown-lesson'): LessonProgress => ({
  lessonId,
  contentVersion: 1,
  assessmentVersion: 1,
  generation: 'generation-1',
  startedAt: 100,
  skippedAt: 200,
  video: {
    assets: {
      'test-video': {
        durationSeconds: 100,
        ranges: [[0, 50]],
        watchedAt: null,
      },
    },
    legacy: null,
  },
  practice: { 'step-one': 150 },
})

const createStorage = (initial?: unknown) => {
  let raw = initial
  return {
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(raw) })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      raw = structuredClone(values[ACADEMY_PROGRESS_KEY])
    }),
    raw: () => raw,
  }
}

const runExclusive = async <T>(operation: () => Promise<T>): Promise<T> =>
  operation()

const createSerialLock = () => {
  let tail = Promise.resolve()
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation)
    tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

describe('Academy progress persistence', () => {
  it('loads a fresh state without writing on read', async () => {
    const storage = createStorage()
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    expect(await repository.read()).toEqual(emptyAcademyState())
    expect(storage.set).not.toHaveBeenCalled()
    expect(storage.get).toHaveBeenCalledWith(ACADEMY_PROGRESS_KEY)
  })

  it('retains independent lesson and intro facts after constructing a new repository', async () => {
    const storage = createStorage()
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    await repository.update((state) => ({
      ...state,
      lessons: { 'unknown-lesson': progress() },
      intro: { dismissedAt: 100, skippedAt: 200 },
    }))
    const reopened = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    expect(await reopened.read()).toEqual({
      schemaVersion: 2,
      lessons: { 'unknown-lesson': progress() },
      intro: { dismissedAt: 100, skippedAt: 200 },
    })
    expect(storage.set).toHaveBeenCalledTimes(1)
    expect(Object.keys(storage.set.mock.calls[0]?.[0] ?? {})).toEqual([
      ACADEMY_PROGRESS_KEY,
    ])
  })

  it('does not write again when duplicate events leave facts unchanged', async () => {
    const storage = createStorage(emptyAcademyState())
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    await repository.update((state) => ({ ...state }))
    await repository.update((state) => state)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('detects in-place changes before deciding whether a write is necessary', async () => {
    const storage = createStorage(emptyAcademyState())
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    await repository.update((state) => {
      state.intro.dismissedAt = 100
      return state
    })
    expect((await repository.read()).intro.dismissedAt).toBe(100)
    expect(storage.set).toHaveBeenCalledTimes(1)
  })

  it('reads the latest committed facts inside the shared lock for concurrent pages', async () => {
    const storage = createStorage()
    const sharedLock = createSerialLock()
    const first = createChromeAcademyProgressRepository({
      storage,
      runExclusive: sharedLock,
    })
    const second = createChromeAcademyProgressRepository({
      storage,
      runExclusive: sharedLock,
    })
    await Promise.all([
      first.update((state) => ({
        ...state,
        lessons: { ...state.lessons, 'unknown-lesson': progress() },
      })),
      second.update((state) => ({
        ...state,
        intro: { ...state.intro, skippedAt: 250 },
      })),
    ])
    expect(await first.read()).toEqual({
      schemaVersion: 2,
      lessons: { 'unknown-lesson': progress() },
      intro: { dismissedAt: null, skippedAt: 250 },
    })
  })

  it.each([
    null,
    {
      schemaVersion: '1',
      lessons: {},
      intro: { dismissedAt: null, skippedAt: null },
    },
    { ...emptyAcademyState(), extra: true },
    {
      ...emptyAcademyState(),
      lessons: {
        'unknown-lesson': {
          ...progress(),
          video: {
            assets: {
              constructor: {
                durationSeconds: 100,
                ranges: [],
                watchedAt: null,
              },
            },
            legacy: null,
          },
        },
      },
    },
    {
      ...emptyAcademyState(),
      lessons: {
        'unknown-lesson': {
          ...progress(),
          video: {
            assets: Object.fromEntries(
              Array.from({ length: 33 }, (_, index) => [
                `asset-${index}`,
                { durationSeconds: 100, ranges: [], watchedAt: null },
              ]),
            ),
            legacy: null,
          },
        },
      },
    },
    {
      ...emptyAcademyState(),
      schemaVersion: 1,
      lessons: {
        'unknown-lesson': {
          ...progress(),
          video: { durationSeconds: 100, ranges: [[0, 101]], watchedAt: null },
        },
      },
    },
    { ...emptyAcademyState(), lessons: { 'wrong-id': progress() } },
    { ...emptyAcademyState(), intro: { dismissedAt: -1, skippedAt: null } },
    { ...emptyAcademyState(), lessons: JSON.parse('{"__proto__": {}}') },
    {
      ...emptyAcademyState(),
      lessons: { constructor: progress('constructor') },
    },
    {
      ...emptyAcademyState(),
      lessons: {
        'unknown-lesson': { ...progress(), practice: { constructor: 100 } },
      },
    },
    {
      ...emptyAcademyState(),
      lessons: Object.fromEntries(
        Array.from({ length: 257 }, (_, index) => [
          `lesson-${index}`,
          progress(`lesson-${index}`),
        ]),
      ),
    },
  ])(
    'rejects malformed state while retaining raw data for rescue',
    async (raw) => {
      const storage = createStorage(raw)
      const repository = createChromeAcademyProgressRepository({
        storage,
        runExclusive,
      })
      await expect(repository.read()).rejects.toMatchObject({
        name: 'AcademyPersistenceError',
        code: 'INVALID_STATE',
      })
      await expect(repository.update((state) => state)).rejects.toMatchObject({
        code: 'INVALID_STATE',
      })
      expect(await repository.exportRaw()).toEqual(raw)
      expect(storage.set).not.toHaveBeenCalled()
    },
  )

  it('requires an explicit migration for unsupported schema versions', async () => {
    const raw = { schemaVersion: 3, data: 'future state' }
    const storage = createStorage(raw)
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    await expect(repository.read()).rejects.toMatchObject({
      code: 'UNSUPPORTED_SCHEMA',
    })
    await expect(
      repository.update(() => emptyAcademyState()),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEMA' })
    expect(await repository.exportRaw()).toEqual(raw)
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('rejects an oversized payload before writing and keeps the previous state', async () => {
    const storage = createStorage(emptyAcademyState())
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    await expect(
      repository.update((state) => ({
        ...state,
        lessons: {
          'unknown-lesson': {
            ...progress(),
            generation: 'x'.repeat(ACADEMY_PROGRESS_MAX_BYTES),
          },
        },
      })),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect(await repository.read()).toEqual(emptyAcademyState())
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('rejects a cyclic result without replacing persisted state', async () => {
    const storage = createStorage(emptyAcademyState())
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    await expect(
      repository.update((state) => {
        Reflect.set(state.lessons, 'cycle', state)
        return state
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect(storage.set).not.toHaveBeenCalled()
    expect(await repository.read()).toEqual(emptyAcademyState())
  })

  it('exposes safe retryable read and write failures without leaking the original error', async () => {
    const storage = createStorage(emptyAcademyState())
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    storage.get.mockRejectedValueOnce(new Error('secret raw state'))
    await expect(repository.read()).rejects.toEqual(
      new AcademyPersistenceError('READ_FAILED'),
    )
    expect(await repository.read()).toEqual(emptyAcademyState())
    storage.set.mockRejectedValueOnce(new Error('secret raw state'))
    const change = (state: ReturnType<typeof emptyAcademyState>) => ({
      ...state,
      intro: { ...state.intro, dismissedAt: 200 },
    })
    await expect(repository.update(change)).rejects.toEqual(
      new AcademyPersistenceError('WRITE_FAILED'),
    )
    expect(await repository.read()).toEqual(emptyAcademyState())
    await repository.update(change)
    expect((await repository.read()).intro.dismissedAt).toBe(200)
  })

  it('fails closed when storage or coordination is unavailable', async () => {
    const withoutStorage = createChromeAcademyProgressRepository({
      runExclusive,
    })
    await expect(withoutStorage.read()).rejects.toEqual(
      new AcademyPersistenceError('UNAVAILABLE'),
    )
    const storage = createStorage()
    vi.stubGlobal('navigator', {})
    await expect(
      createChromeAcademyProgressRepository({ storage }).update(
        (state) => state,
      ),
    ).rejects.toEqual(new AcademyPersistenceError('COORDINATION_UNAVAILABLE'))
    expect(storage.get).not.toHaveBeenCalled()
    expect(storage.set).not.toHaveBeenCalled()
  })

  it('uses the stable exclusive Web Lock around production-wrapper reads and writes', async () => {
    const storage = createStorage()
    const request = vi.fn(
      async (
        _name: string,
        _options: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
    )
    chromeStorage.getLocal.mockReturnValueOnce(storage)
    chromeStorage.getLocal.mockReturnValueOnce(storage)
    vi.stubGlobal('navigator', { locks: { request } })
    await createChromeAcademyProgressRepository().update((state) => ({
      ...state,
      intro: { dismissedAt: 300, skippedAt: null },
    }))
    expect(request).toHaveBeenCalledWith(
      ACADEMY_PROGRESS_LOCK,
      { mode: 'exclusive' },
      expect.any(Function),
    )
    expect(storage.set).toHaveBeenCalledTimes(1)
  })

  it('reports a rejected lock request without running any storage operation', async () => {
    const storage = createStorage()
    const request = vi.fn().mockRejectedValue(new Error('private lock failure'))
    vi.stubGlobal('navigator', { locks: { request } })
    await expect(
      createChromeAcademyProgressRepository({ storage }).update(
        (state) => state,
      ),
    ).rejects.toEqual(new AcademyPersistenceError('COORDINATION_UNAVAILABLE'))
    expect(storage.get).not.toHaveBeenCalled()
  })

  it('preserves an application rejection and never commits its partial mutation', async () => {
    const storage = createStorage(emptyAcademyState())
    const repository = createChromeAcademyProgressRepository({
      storage,
      runExclusive,
    })
    const failure = new Error('invalid practice completion')
    await expect(
      repository.update((state) => {
        state.intro.dismissedAt = 200
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(storage.set).not.toHaveBeenCalled()
    expect(await repository.read()).toEqual(emptyAcademyState())
  })
})
