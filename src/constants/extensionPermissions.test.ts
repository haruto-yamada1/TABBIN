import { describe, expect, it } from 'vitest' // eslint-disable-line

import { PRODUCTION_EXTENSION_PERMISSIONS } from './extensionPermissions'

describe('production extension permission policy', () => {
  it('allows only the reviewed permissions including persistence durability', () => {
    expect(PRODUCTION_EXTENSION_PERMISSIONS).toEqual([
      'alarms',
      'tabs',
      'storage',
      'contextMenus',
      'notifications',
      'unlimitedStorage',
    ])
    expect(new Set(PRODUCTION_EXTENSION_PERMISSIONS).size).toBe(
      PRODUCTION_EXTENSION_PERMISSIONS.length,
    )
  })
})
