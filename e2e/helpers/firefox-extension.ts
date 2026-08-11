/* eslint-disable typescript/no-misused-promises, typescript/no-floating-promises, playwright/no-skipped-test -- Firefox startup smoke is gated by FIREFOX_EXTENSION_SMOKE=1 */
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test as base, firefox } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

const firefoxArtifactDir = path.join(process.cwd(), '.output', 'firefox-mv2')
const FIREFOX_SMOKE_EXTENSION_ID = 'tabbin@local'

const SMOKE_FLAG = 'FIREFOX_EXTENSION_SMOKE'
const SMOKE_SKIP_REASON =
  'set FIREFOX_EXTENSION_SMOKE=1 to run the Firefox startup smoke'

export const isFirefoxExtensionSmokeEnabled = (): boolean =>
  process.env[SMOKE_FLAG] === '1'

const FIREFOX_SMOKE_PREFS = {
  'extensions.autoDisableScopes': 0,
  'xpinstall.signatures.required': false,
  'extensions.lang-signing.required': false,
  'app.update.enabled': false,
  'app.update.auto': false,
  'browser.startup.homepage': 'about:blank',
  'startup.homepage_welcome_url': '',
  'startup.homepage_welcome_url.additional': '',
  'browser.shell.checkDefaultBrowser': false,
  'datareporting.healthreport.uploadEnabled': false,
  'datareporting.policy.dataSubmissionEnabled': false,
  'extensions.update.enabled': false,
  'extensions.update.autoUpdateDefault': false,
}

const launchFirefoxExtensionSession = async (
  profileDir: string,
): Promise<BrowserContext> => {
  return firefox.launchPersistentContext(profileDir, {
    bypassCSP: true,
    ...(process.env.FIREFOX_EXECUTABLE_PATH
      ? { executablePath: process.env.FIREFOX_EXECUTABLE_PATH }
      : {}),
    firefoxUserPrefs: FIREFOX_SMOKE_PREFS,
    handleSIGINT: true,
    handleSIGTERM: true,
  })
}

const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const prepareUnpackedFirefoxExtension = async (
  profileDir: string,
): Promise<void> => {
  const unpackedDir = path.join(
    profileDir,
    'extensions',
    FIREFOX_SMOKE_EXTENSION_ID,
  )
  await mkdir(path.dirname(unpackedDir), { recursive: true })
  await cp(firefoxArtifactDir, unpackedDir, { recursive: true })

  const manifestPath = path.join(unpackedDir, 'manifest.json')
  const parsedManifest: unknown = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  )
  if (!isRecord(parsedManifest)) {
    throw new Error('Firefox artifact manifest must be an object.')
  }
  const manifest = parsedManifest
  const browserSpecificSettings = isRecord(manifest.browser_specific_settings)
    ? manifest.browser_specific_settings
    : {}
  const gecko = isRecord(browserSpecificSettings.gecko)
    ? browserSpecificSettings.gecko
    : {}
  manifest.browser_specific_settings = {
    ...browserSpecificSettings,
    gecko: {
      ...gecko,
      id: FIREFOX_SMOKE_EXTENSION_ID,
    },
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
}

// Synchronously walk the parsed addon entries once from memory instead of
// nesting null/type checks each iteration.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const getString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

const findInstallUuid = (parsed: unknown): string | undefined => {
  if (!isRecord(parsed)) {
    return undefined
  }
  const addonsValue: unknown = parsed.addons
  const addons = Array.isArray(addonsValue) ? addonsValue : []
  for (const entry of addons) {
    if (!isRecord(entry)) {
      continue
    }
    const addonPath = getString(entry, 'path')
    if (addonPath === undefined || !addonPath.includes('firefox-mv2')) {
      continue
    }
    // `moz-extension://` origin uses Firefox's installation-specific
    // `internalUUID`, NOT the add-on manifest `id`. Falling back to `id`
    // would produce `moz-extension://tabbin@local/` which Firefox rejects
    // as an invalid origin. We refuse to return a UUID unless
    // `internalUUID` is actually present in extensions.json.
    const internalUuid = getString(entry, 'internalUUID')
    if (internalUuid !== undefined) {
      return internalUuid
    }
  }
  return undefined
}

const pollExtensionsJsonUuid = async (
  profileDir: string,
  timeoutMs = 8_000,
): Promise<string | undefined> => {
  const jsonPath = path.join(profileDir, 'extensions.json')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!existsSync(jsonPath)) {
      // eslint-disable-next-line no-await-in-loop -- polling browser-written file
      await wait(100)
      continue
    }
    try {
      // eslint-disable-next-line no-await-in-loop -- intentional poll loop
      const raw = await readFile(jsonPath, 'utf8')
      const uuid = findInstallUuid(JSON.parse(raw))
      if (uuid !== undefined) {
        return uuid
      }
    } catch {
      // File is being written; retry on next tick.
    }
    // eslint-disable-next-line no-await-in-loop -- intentional poll loop
    await wait(100)
  }
  return undefined
}

const resolveFirefoxExtensionUuid = async (
  profileDir: string,
): Promise<string> => {
  const uuid = await pollExtensionsJsonUuid(profileDir)
  if (uuid === undefined) {
    throw new Error(
      'Firefox smoke did not find TABBIN with an internalUUID in extensions.json before timeout. The executable launched but does not support the unsigned unpacked extension; use a Playwright, Developer Edition, or Unbranded Firefox build, or provide a signed artifact.',
    )
  }
  return uuid
}

// Skip decision is made here at the fixture level because the Polyfill guard
// document for `test.skip` inside fixture setup already covers our pattern
// (microsoft/playwright#15071 is about conditional skip inside custom
// fixtures, which is exactly our use case). The skip helper keeps the fixture
// noop so any later code never runs when the env flag is off.
const ensureSmokeEnabled = (): void => {
  if (!isFirefoxExtensionSmokeEnabled()) {
    base.skip(true, SMOKE_SKIP_REASON)
  }
}

type FirefoxExtensionSmokeFixtures = {
  firefoxExtensionProfile: string
  firefoxExtensionContext: BrowserContext
  firefoxExtensionPage: Page
  firefoxExtensionUuid: string
}

export const test = base.extend<FirefoxExtensionSmokeFixtures>({
  firefoxExtensionProfile: async ({}, runFixture) => {
    ensureSmokeEnabled()
    const profileDir = await mkdtemp(
      path.join(os.tmpdir(), 'tabbin-firefox-smoke-'),
    )
    try {
      await prepareUnpackedFirefoxExtension(profileDir)
      await runFixture(profileDir)
    } finally {
      await rm(profileDir, { force: true, recursive: true })
    }
  },
  firefoxExtensionContext: async ({ firefoxExtensionProfile }, runFixture) => {
    ensureSmokeEnabled()
    const context = await launchFirefoxExtensionSession(firefoxExtensionProfile)
    try {
      await runFixture(context)
    } finally {
      await context.close()
    }
  },
  firefoxExtensionPage: async ({ firefoxExtensionContext }, runFixture) => {
    const page = await firefoxExtensionContext.newPage()
    await runFixture(page).finally(async () => {
      await page.close()
    })
  },
  firefoxExtensionUuid: async ({ firefoxExtensionProfile }, runFixture) => {
    ensureSmokeEnabled()
    const uuid = await resolveFirefoxExtensionUuid(firefoxExtensionProfile)
    await runFixture(uuid)
  },
})

export const getFirefoxExtensionUrl = (
  uuid: string,
  pathname: string,
): string => `moz-extension://${uuid}/${pathname.replace(/^\//u, '')}`

export { expect }
