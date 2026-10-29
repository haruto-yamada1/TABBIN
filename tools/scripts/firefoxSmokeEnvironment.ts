import { constants, accessSync, statSync } from 'node:fs'
import path from 'node:path'

import { firefox } from '@playwright/test'

export type FirefoxSmokeExecutables = {
  readonly geckodriverPath: string
  readonly firefoxPath: string
}

export type FirefoxSmokeEnvironmentOptions = {
  readonly environment?: Readonly<Record<string, string | undefined>>
  readonly platform?: NodeJS.Platform
  readonly playwrightFirefoxPath?: string
}

export class FirefoxIndexedDbSmokeUnsupportedError extends Error {
  readonly code = 'FIREFOX_INDEXEDDB_SMOKE_UNSUPPORTED_EXECUTABLE'

  constructor(message: string, options?: ErrorOptions) {
    super(`FIREFOX_INDEXEDDB_SMOKE_UNSUPPORTED_EXECUTABLE: ${message}`, options)
    this.name = 'FirefoxIndexedDbSmokeUnsupportedError'
  }
}

const isExecutableFile = (candidate: string): boolean => {
  try {
    if (!statSync(candidate).isFile()) {
      return false
    }
    accessSync(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const findExecutable = (
  command: string,
  searchPath: string,
  platform: NodeJS.Platform,
): string | undefined => {
  if (!command) {
    return undefined
  }
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    const absolute = path.resolve(command)
    return isExecutableFile(absolute) ? absolute : undefined
  }
  const filename =
    platform === 'win32' && !command.endsWith('.exe')
      ? `${command}.exe`
      : command
  return searchPath
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.resolve(directory, filename))
    .find(isExecutableFile)
}

export const resolveFirefoxSmokeEnvironment = (
  options: FirefoxSmokeEnvironmentOptions = {},
): FirefoxSmokeExecutables => {
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const searchPath = environment.PATH ?? ''
  const geckodriverPath = findExecutable(
    environment.GECKODRIVER_PATH ?? 'geckodriver',
    searchPath,
    platform,
  )
  const nativeFirefox = findExecutable('firefox', searchPath, platform)
  const appCandidates =
    platform === 'darwin'
      ? [
          '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
          '/Applications/Firefox Nightly.app/Contents/MacOS/firefox',
          '/Applications/Firefox.app/Contents/MacOS/firefox',
        ]
      : []
  const firefoxPath =
    environment.FIREFOX_EXECUTABLE_PATH !== undefined
      ? findExecutable(
          environment.FIREFOX_EXECUTABLE_PATH,
          searchPath,
          platform,
        )
      : (nativeFirefox ??
        [
          ...appCandidates,
          options.playwrightFirefoxPath ?? firefox.executablePath(),
        ].find(isExecutableFile))
  const missing = [
    ...(!geckodriverPath ? ['geckodriver (GECKODRIVER_PATH)'] : []),
    ...(!firefoxPath ? ['Firefox (FIREFOX_EXECUTABLE_PATH)'] : []),
  ]
  if (!geckodriverPath || !firefoxPath) {
    throw new FirefoxIndexedDbSmokeUnsupportedError(
      `Missing or non-executable: ${missing.join(', ')}. Configure the named executable paths before running the required smoke. No browser was started.`,
    )
  }
  return { geckodriverPath, firefoxPath }
}

export const createFirefoxSmokeProcessEnvironment = ({
  environment,
  platform,
  appDataDirectory,
}: {
  environment: Readonly<Record<string, string | undefined>>
  platform: NodeJS.Platform
  appDataDirectory: string
}): Record<string, string | undefined> => ({
  ...environment,
  // macOS 27 protects the real Firefox app-data root even with -profile.
  // Keep this test process in its own empty Cocoa app-data root instead.
  // https://github.com/microsoft/playwright/issues/42768
  ...(platform === 'darwin' ? { CFFIXED_USER_HOME: appDataDirectory } : {}),
})
