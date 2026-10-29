import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveFirefoxSmokeEnvironment } from './firefoxSmokeEnvironment'
import type { FirefoxSmokeEnvironmentOptions } from './firefoxSmokeEnvironment'

let directory: string
let options: FirefoxSmokeEnvironmentOptions

const executable = (name: string) => {
  const target = path.join(directory, name)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  return target
}

describe('native Firefox smoke environment', () => {
  beforeEach(() => {
    directory = mkdtempSync(path.join(os.tmpdir(), 'firefox-smoke-preflight-'))
    options = {
      environment: { PATH: '' },
      platform: 'linux',
      playwrightFirefoxPath: path.join(directory, 'missing-playwright-firefox'),
    }
  })
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('reports both missing prerequisites without starting a browser', () => {
    expect(() => resolveFirefoxSmokeEnvironment(options)).toThrow(
      /FIREFOX_INDEXEDDB_SMOKE_UNSUPPORTED_EXECUTABLE/u,
    )
    expect(() => resolveFirefoxSmokeEnvironment(options)).toThrow(
      /GECKODRIVER_PATH.*FIREFOX_EXECUTABLE_PATH/u,
    )
  })

  it('preserves explicit executable paths with spaces and shell characters as data', () => {
    const geckodriverPath = executable('driver dir; ignored/geckodriver')
    const firefoxPath = executable('Firefox $(ignored).app/firefox')
    expect(
      resolveFirefoxSmokeEnvironment({
        ...options,
        environment: {
          PATH: '',
          GECKODRIVER_PATH: geckodriverPath,
          FIREFOX_EXECUTABLE_PATH: firefoxPath,
        },
      }),
    ).toEqual({ geckodriverPath, firefoxPath })
  })

  it('finds executable files on PATH and skips files without execute permission', () => {
    const unusable = executable('first/geckodriver')
    chmodSync(unusable, 0o600)
    const geckodriverPath = executable('second/geckodriver')
    const firefoxPath = executable('second/firefox')
    expect(
      resolveFirefoxSmokeEnvironment({
        ...options,
        environment: {
          PATH: [path.dirname(unusable), path.dirname(geckodriverPath)].join(
            path.delimiter,
          ),
        },
      }),
    ).toEqual({ geckodriverPath, firefoxPath })
  })

  it('uses the installed Playwright Firefox only when no native candidate is available', () => {
    const geckodriverPath = executable('geckodriver')
    const firefoxPath = executable('playwright/firefox')
    expect(
      resolveFirefoxSmokeEnvironment({
        ...options,
        environment: { PATH: directory },
        playwrightFirefoxPath: firefoxPath,
      }),
    ).toEqual({ geckodriverPath, firefoxPath })
  })

  it.each(['GECKODRIVER_PATH', 'FIREFOX_EXECUTABLE_PATH'] as const)(
    'fails closed for invalid explicit %s instead of using another installed binary',
    (setting) => {
      executable('geckodriver')
      executable('firefox')
      expect(() =>
        resolveFirefoxSmokeEnvironment({
          ...options,
          environment: {
            PATH: directory,
            [setting]: path.join(directory, 'missing'),
          },
        }),
      ).toThrow(setting)
    },
  )

  it('rejects directories and empty explicit overrides rather than calling them executables', () => {
    expect(() =>
      resolveFirefoxSmokeEnvironment({
        ...options,
        environment: {
          PATH: '',
          GECKODRIVER_PATH: directory,
          FIREFOX_EXECUTABLE_PATH: '',
        },
      }),
    ).toThrow(/geckodriver.*Firefox/u)
  })
})
