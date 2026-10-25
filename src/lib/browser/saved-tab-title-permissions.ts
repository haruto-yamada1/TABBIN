import { isObjectLike } from './chrome-global'

type PermissionAccess = { permissions: string[]; origins: string[] }
type PermissionEvent = {
  addListener: (listener: () => void) => void
  removeListener: (listener: () => void) => void
}
export type SavedTabTitlePermissions = {
  contains: (access: PermissionAccess) => Promise<boolean>
  request: (access: PermissionAccess) => Promise<boolean>
  onAdded: PermissionEvent
  onRemoved: PermissionEvent
}

const isPermissionEvent = (value: unknown): value is PermissionEvent =>
  isObjectLike(value) &&
  typeof Reflect.get(value, 'addListener') === 'function' &&
  typeof Reflect.get(value, 'removeListener') === 'function'

const isPermissionsApi = (value: unknown): value is SavedTabTitlePermissions =>
  isObjectLike(value) &&
  typeof Reflect.get(value, 'contains') === 'function' &&
  typeof Reflect.get(value, 'request') === 'function' &&
  isPermissionEvent(Reflect.get(value, 'onAdded')) &&
  isPermissionEvent(Reflect.get(value, 'onRemoved'))

const readPermissions = (api: unknown): SavedTabTitlePermissions | null => {
  const permissions: unknown = isObjectLike(api)
    ? Reflect.get(api, 'permissions')
    : undefined
  return isPermissionsApi(permissions) ? permissions : null
}

/** Firefox's browser namespace preserves the Promise contract; Chrome MV3 also supports it. */
export const getSavedTabTitlePermissions =
  (): SavedTabTitlePermissions | null =>
    readPermissions(Reflect.get(globalThis, 'browser')) ??
    readPermissions(Reflect.get(globalThis, 'chrome'))
