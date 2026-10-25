import { describe, expect, it } from 'vitest'

import { getSavedTabTitlePermissions } from '@/lib/browser/saved-tab-title-permissions'

import {
  createStorybookChromeMock,
  resetStorybookBrowserMocks,
  setStorybookStorage,
} from './browser-mocks'

describe('storybook browser mocks', () => {
  it('supports optional permissions without granting site access', async () => {
    createStorybookChromeMock()
    const permissions = getSavedTabTitlePermissions()
    const access = {
      permissions: ['scripting'],
      origins: ['http://*/*', 'https://*/*'],
    }

    expect(permissions).not.toBeNull()
    await expect(permissions?.contains(access)).resolves.toBe(false)
    await expect(permissions?.request(access)).resolves.toBe(false)
    await expect(permissions?.contains(access)).resolves.toBe(false)
  })

  it('stores and reads local storage values', async () => {
    const chromeMock = createStorybookChromeMock()

    setStorybookStorage({
      'tab-manager-theme': 'dark',
      userSettings: {
        colors: {
          background: '#101010',
        },
      },
    })

    await expect(
      chromeMock.storage.local.get(['tab-manager-theme', 'userSettings']),
    ).resolves.toStrictEqual({
      'tab-manager-theme': 'dark',
      userSettings: {
        colors: {
          background: '#101010',
        },
      },
    })

    resetStorybookBrowserMocks()
    await expect(
      chromeMock.storage.local.get('tab-manager-theme'),
    ).resolves.toStrictEqual({})
  })
})
