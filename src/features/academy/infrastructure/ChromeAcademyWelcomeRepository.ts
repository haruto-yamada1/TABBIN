import type { AcademyWelcomeRepository } from '@/features/academy/application/ports/AcademyWelcomePorts'
import { getChromeStorageLocal } from '@/lib/browser/chrome-storage'

export const ACADEMY_WELCOME_KEY = 'academyWelcomeV1'
export const ACADEMY_WELCOME_LOCK = 'tabbin:academy-welcome:v1'

type Storage = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (values: Record<string, unknown>) => Promise<void>
}
type Dependencies = {
  storage?: Storage
  runExclusive?: <T>(operation: () => Promise<T>) => Promise<T>
}

const isLockManager = (value: unknown): value is LockManager =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'request') === 'function'

const withLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  const candidate: unknown = Reflect.get(globalThis, 'navigator')
  const locks: unknown =
    typeof candidate === 'object' && candidate !== null
      ? Reflect.get(candidate, 'locks')
      : null
  if (!isLockManager(locks)) {
    throw new Error('Academy welcome coordination unavailable')
  }
  return locks.request(ACADEMY_WELCOME_LOCK, { mode: 'exclusive' }, operation)
}

/** No missing marker is interpreted as a new installation. Claim before showing. */
export const createChromeAcademyWelcomeRepository = (
  deps: Dependencies = {},
): AcademyWelcomeRepository => {
  const storage = () => {
    const local = deps.storage ?? getChromeStorageLocal()
    if (!local) {
      throw new Error('Academy welcome storage unavailable')
    }
    return local
  }
  const write = async (value: 'pending' | 'presented') => {
    const local = deps.storage ?? getChromeStorageLocal()
    if (!local) {
      throw new Error('Academy welcome storage unavailable')
    }
    await local.set({ [ACADEMY_WELCOME_KEY]: value })
  }
  const read = async () => {
    const values = await storage().get(ACADEMY_WELCOME_KEY)
    const value = values[ACADEMY_WELCOME_KEY]
    if (value !== undefined && value !== 'pending' && value !== 'presented') {
      throw new Error('Academy welcome state invalid')
    }
    return value
  }
  return {
    prepare: async () =>
      (deps.runExclusive ?? withLock)(async () => {
        if ((await read()) === undefined) {
          await write('pending')
        }
      }),
    isPending: async () => (await read()) === 'pending',
    claim: async () =>
      (deps.runExclusive ?? withLock)(async () => {
        if ((await read()) !== 'pending') {
          return false
        }
        await write('presented')
        return true
      }),
  }
}
