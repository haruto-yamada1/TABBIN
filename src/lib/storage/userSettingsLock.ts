const USER_SETTINGS_LOCK = 'tabbin:user-settings:v1'

const isLockManager = (value: unknown): value is LockManager =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'request') === 'function'

/** Serialize settings mutations across extension pages and fail closed if unavailable. */
export const withUserSettingsLock = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const nav: unknown = Reflect.get(globalThis, 'navigator')
  const locks: unknown =
    typeof nav === 'object' && nav !== null
      ? Reflect.get(nav, 'locks')
      : undefined
  if (!isLockManager(locks)) {
    throw new Error('User settings coordination is unavailable')
  }
  return locks.request(USER_SETTINGS_LOCK, { mode: 'exclusive' }, operation)
}
