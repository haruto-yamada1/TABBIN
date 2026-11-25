import { describe, expect, it, vi } from 'vitest'

import { navigateAfterFirefoxInstall } from './firefoxExtensionSession'
import type { FirefoxExtensionSession } from './firefoxExtensionSession'

describe('Firefox measurement navigation', () => {
  it('waits for installation before opening a page the installer deduplicates', async () => {
    const route = 'app.html#/saved-tabs'
    let currentPage = ''
    let installed = false
    const navigate = vi.fn<FirefoxExtensionSession['navigate']>(
      async (page) => {
        if (page === route && !installed) {
          throw new Error('Browsing context has been discarded')
        }
        currentPage = page
      },
    )
    const evaluate = vi
      .fn<FirefoxExtensionSession['evaluate']>()
      .mockResolvedValueOnce(false)
      .mockImplementation(async () => {
        expect(currentPage).toBe('icon/128.png')
        installed = true
        return installed
      })

    await navigateAfterFirefoxInstall({ evaluate, navigate }, route)

    expect(navigate.mock.calls).toEqual([['icon/128.png'], [route]])
    expect(evaluate).toHaveBeenCalledTimes(2)
  })

  it('reports a driver error while checking installation', async () => {
    const failure = new Error('WebDriver session disconnected')
    const navigate = vi.fn<FirefoxExtensionSession['navigate']>()
    const evaluate = vi
      .fn<FirefoxExtensionSession['evaluate']>()
      .mockRejectedValue(failure)

    await expect(
      navigateAfterFirefoxInstall(
        { evaluate, navigate },
        'app.html#/saved-tabs',
      ),
    ).rejects.toBe(failure)
    expect(navigate.mock.calls).toEqual([['icon/128.png']])
  })
})
