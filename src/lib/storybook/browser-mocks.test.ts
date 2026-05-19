import { describe, expect, it } from 'vitest'

import {
  createStorybookChromeMock,
  resetStorybookBrowserMocks,
  setStorybookStorage,
} from './browser-mocks'

describe('storybook browser mocks', () => {
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
    ).resolves.toEqual({
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
    ).resolves.toEqual({})
  })
})
