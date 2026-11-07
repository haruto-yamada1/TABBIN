import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { readPersistenceV2SavedTabsSnapshot } from '#academy-extension'
import { academyManifest } from '#academy-fixture'
import { chromium, expect } from '@playwright/test'
import type { BrowserContext, Worker } from '@playwright/test'

import { validateSaveFlow } from './contract'
import type { RecordedTab, RecordingSource, SaveFlowEvidence } from './contract'

export type RecordingBrowser = 'chrome' | 'chromium'
export type RecordingCommand =
  | 'installed'
  | 'prepare'
  | 'verify'
  | 'finish'
  | 'abort'
export type RecordingStage =
  | 'awaiting-install'
  | 'installed'
  | 'prepared'
  | 'verified'
  | 'finished'
  | 'aborted'

type LaunchOptions = NonNullable<
  Parameters<typeof chromium.launchPersistentContext>[1]
>
type ObservedSettings = {
  clickBehavior: string | null
  excludePinnedTabs: boolean | null
  excludePatterns: string[] | null
}

type BeforeSave = {
  tabs: RecordedTab[]
  settings: ObservedSettings
  isOnToolbar: boolean
}

const storeId = 'dljblklbpmoocinnlcejeokopmfoldaj'
const storeUrl = `https://chromewebstore.google.com/detail/tabbin/${storeId}`
const fixturePages = academyManifest.sites.flatMap((site) =>
  site.pages.map((page) => ({
    url: `https://${site.hostname}${page.path}`,
    title: page.title,
  })),
)
const expectedUrls = fixturePages.map((page) => page.url)
const commands: readonly string[] = [
  'installed',
  'prepare',
  'verify',
  'finish',
  'abort',
]
const isRecordingCommand = (command: string): command is RecordingCommand =>
  commands.includes(command)
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const recordingLaunchOptions = (
  source: RecordingSource,
  browser: RecordingBrowser,
): LaunchOptions => {
  if (source === 'unpacked-development' && browser !== 'chromium') {
    throw new Error('Unpacked development requires chromium.')
  }
  const extensionPath = path.resolve('.output', 'chrome-mv3')
  return {
    channel: browser,
    headless: false,
    viewport: { width: 1280, height: 720 },
    ...(source === 'chrome-web-store'
      ? { ignoreDefaultArgs: ['--disable-extensions'] }
      : {
          args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        }),
  }
}

export const requireRecordingStage = (
  stage: RecordingStage,
  command: RecordingCommand,
) => {
  const allowed: Record<RecordingCommand, readonly RecordingStage[]> = {
    installed: ['awaiting-install'],
    prepare: ['installed'],
    verify: ['prepared'],
    finish: ['verified'],
    abort: ['awaiting-install', 'installed', 'prepared', 'verified'],
  }
  if (!allowed[command].includes(stage)) {
    throw new Error(`Cannot run ${command} from ${stage}.`)
  }
}

const observeSettings = async (worker: Worker): Promise<ObservedSettings> =>
  worker.evaluate(async () => {
    const values = await chrome.storage.local.get('userSettings')
    const stored: unknown = values.userSettings
    const settings = typeof stored === 'object' && stored !== null ? stored : {}
    const clickBehavior: unknown = Reflect.get(settings, 'clickBehavior')
    const excludePinnedTabs: unknown = Reflect.get(
      settings,
      'excludePinnedTabs',
    )
    const excludePatterns: unknown = Reflect.get(settings, 'excludePatterns')
    return {
      clickBehavior: typeof clickBehavior === 'string' ? clickBehavior : null,
      excludePinnedTabs:
        typeof excludePinnedTabs === 'boolean' ? excludePinnedTabs : null,
      excludePatterns: Array.isArray(excludePatterns)
        ? excludePatterns.filter(
            (item): item is string => typeof item === 'string',
          )
        : null,
    }
  })

const observeTabs = async (worker: Worker): Promise<RecordedTab[]> =>
  worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({})
    return tabs.map((tab) => {
      if (tab.id === undefined || tab.url === undefined) {
        throw new Error('A browser tab did not expose its ID or URL.')
      }
      return { id: tab.id, url: tab.url, active: tab.active }
    })
  })

export class RecordingSession {
  readonly runDir: string
  readonly profileDir: string
  readonly source: RecordingSource
  readonly browser: RecordingBrowser
  readonly context: BrowserContext
  stage: RecordingStage = 'awaiting-install'
  private worker: Worker | undefined
  private extensionId: string | undefined
  private before: BeforeSave | undefined
  private verification: ReturnType<typeof validateSaveFlow> | undefined
  private failureCount = 0
  private closed = false

  constructor(options: {
    runDir: string
    profileDir: string
    source: RecordingSource
    browser: RecordingBrowser
    context: BrowserContext
  }) {
    this.runDir = options.runDir
    this.profileDir = options.profileDir
    this.source = options.source
    this.browser = options.browser
    this.context = options.context
  }

  private async saveJson(name: string, data: unknown) {
    await writeFile(
      path.join(this.runDir, name),
      `${JSON.stringify(data, null, 2)}\n`,
      { mode: 0o600 },
    )
  }

  private async log(command: string, status: string, details: unknown = null) {
    await appendFile(
      path.join(this.runDir, 'operations.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), command, status, stage: this.stage, details })}\n`,
      { mode: 0o600 },
    )
  }

  private async saveSummary(status: string) {
    await this.saveJson('result.json', {
      schemaVersion: 1,
      source: this.source,
      browser: this.browser,
      browserVersion: this.context.browser()?.version() ?? null,
      environment: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
      },
      profilePolicy: 'fresh-temporary-profile',
      profileRemoved: this.closed,
      stage: this.stage,
      status,
      failureCount: this.failureCount,
      saveFlow: this.verification ?? { status: 'unverified' },
      nativeEvidence: {
        status: 'pending',
        required: ['install', 'pin', 'save'],
      },
      diagnosticPageVideo:
        'diagnostic-pages/ (web content only; excludes browser toolbar)',
    })
  }

  async command(command: string) {
    try {
      if (!isRecordingCommand(command)) {
        throw new Error(`Unknown command. Use: ${commands.join(', ')}.`)
      }
      requireRecordingStage(this.stage, command)
      await this.execute(command)
      await this.log(command, 'passed')
      let status = 'running'
      if (this.stage === 'finished') {
        status = 'pending-native-evidence'
      } else if (this.stage === 'aborted') {
        status = 'failed'
      }
      await this.saveSummary(status)
    } catch (error) {
      this.failureCount += 1
      await this.log(command, 'failed', { error: errorMessage(error) })
      const page = this.context.pages().at(-1)
      if (page) {
        await page
          .screenshot({
            path: path.join(this.runDir, `failure-${this.failureCount}.png`),
          })
          .catch(async (screenshotError: unknown) => {
            await this.log('failure-screenshot', 'failed', {
              error: errorMessage(screenshotError),
            })
          })
      }
      await this.saveSummary('failed')
      throw error
    }
  }

  private async execute(command: RecordingCommand) {
    switch (command) {
      case 'installed': {
        await this.installed()
        this.stage = 'installed'
        break
      }
      case 'prepare': {
        await this.prepare()
        this.stage = 'prepared'
        break
      }
      case 'verify': {
        await this.verify()
        this.stage = 'verified'
        break
      }
      case 'finish': {
        this.stage = 'finished'
        break
      }
      case 'abort': {
        this.stage = 'aborted'
        break
      }
      default: {
        throw new Error('Unsupported recording command.')
      }
    }
  }

  private requireWorker() {
    if (!this.worker || !this.extensionId) {
      throw new Error('Run installed after completing the real installation.')
    }
    return { worker: this.worker, extensionId: this.extensionId }
  }

  private async installed() {
    const matchesSource = (worker: Worker) => {
      const url = URL.parse(worker.url())
      return (
        url?.protocol === 'chrome-extension:' &&
        (this.source !== 'chrome-web-store' || url.host === storeId)
      )
    }
    const worker =
      this.context.serviceWorkers().find(matchesSource) ??
      (await this.context.waitForEvent('serviceworker', {
        predicate: matchesSource,
        timeout: 30_000,
      }))
    const metadata = await worker.evaluate(async () => {
      const manifest = chrome.runtime.getManifest()
      let installType: string | null = null
      const management: unknown = Reflect.get(chrome, 'management')
      let installTypeReadError: string | null = null
      if (
        typeof management === 'object' &&
        management !== null &&
        typeof Reflect.get(management, 'getSelf') === 'function'
      ) {
        try {
          installType = (await chrome.management.getSelf()).installType
        } catch (error) {
          installTypeReadError =
            error instanceof Error ? error.message : String(error)
        }
      }
      return {
        id: chrome.runtime.id,
        name: manifest.name,
        version: manifest.version,
        manifestVersion: manifest.manifest_version,
        installType,
        installTypeReadError,
      }
    })
    if (!metadata.name.toUpperCase().includes('TABBIN')) {
      throw new Error('The installed extension is not TABBIN.')
    }
    if (this.source === 'chrome-web-store' && metadata.id !== storeId) {
      throw new Error(
        'The extension ID does not match the official store listing.',
      )
    }
    const expectedType =
      this.source === 'chrome-web-store' ? 'normal' : 'development'
    if (
      metadata.installType !== null &&
      metadata.installType !== expectedType
    ) {
      throw new Error(
        `Expected ${expectedType} installation, observed ${metadata.installType}.`,
      )
    }
    await expect
      .poll(
        async () =>
          worker.evaluate(
            async () =>
              (await chrome.storage.local.get('changelogShown')).changelogShown,
          ),
        { timeout: 15_000 },
      )
      .toBe(true)
    this.worker = worker
    this.extensionId = metadata.id
    await this.saveJson('installation.json', {
      ...metadata,
      source: this.source,
      initialStoredSettings: await observeSettings(worker),
    })
    console.log(
      `Installed ${metadata.name} ${metadata.version} (${metadata.id}). In the real Options UI select Save all tabs in the window, then pin TABBIN using the browser extensions menu. Enter prepare afterwards.`,
    )
  }

  private async prepare() {
    const { worker } = this.requireWorker()
    const settings = await observeSettings(worker)
    if (settings.clickBehavior !== 'saveWindowTabs') {
      throw new Error(
        'Select Save all tabs in the window in the real Options UI before prepare.',
      )
    }
    const { isOnToolbar } = await worker.evaluate(async () =>
      chrome.action.getUserSettings(),
    )
    if (!isOnToolbar) {
      throw new Error(
        'Pin TABBIN in the native extensions menu before prepare.',
      )
    }
    const snapshot = await readPersistenceV2SavedTabsSnapshot(worker)
    if (
      [
        snapshot.urls,
        snapshot.collections,
        snapshot.categories,
        snapshot.groups,
        snapshot.memberships,
      ].some((items) => items.length !== 0)
    ) {
      throw new Error(
        'The fresh profile must have no saved tabs or categories. Restart this recording for a new profile.',
      )
    }
    await this.saveJson('before-empty-persistence.json', snapshot)
    await this.context.route('https://*.filming.test/**', async (route) => {
      const page = fixturePages.find(
        (item) => item.url === route.request().url(),
      )
      if (!page) {
        await route.abort()
        return
      }
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html lang="en"><meta charset="utf-8"><title>${page.title}</title><link rel="icon" href="data:,"><h1>${page.title}</h1><p>TABBIN Academy recording fixture. Fictional site; no external services.</p></html>`,
      })
    })
    const fixtureTabs = await Promise.all(
      fixturePages.map(async (fixture) => {
        const tab = await this.context.newPage()
        await tab.goto(fixture.url)
        await expect(tab).toHaveTitle(fixture.title)
        return tab
      }),
    )
    await Promise.all(
      this.context
        .pages()
        .filter((page) => !fixtureTabs.includes(page))
        .map(async (page) => page.close()),
    )
    await fixtureTabs.at(-1)?.bringToFront()
    await expect
      .poll(async () =>
        (await observeTabs(worker)).map((tab) => tab.url).toSorted(),
      )
      .toEqual([...expectedUrls].toSorted())
    this.before = { tabs: await observeTabs(worker), settings, isOnToolbar }
    await this.saveJson('before.json', this.before)
    console.log(
      `${fixturePages.length} real tabs are ready. Record the native toolbar, click the actual pinned TABBIN icon, then enter verify.`,
    )
  }

  private async verify() {
    const { worker, extensionId } = this.requireWorker()
    if (!this.before) {
      throw new Error('No prepared tab evidence exists.')
    }
    const appUrl = `chrome-extension://${extensionId}/app.html#/saved-tabs?mode=domain`
    await expect
      .poll(async () => (await observeTabs(worker)).map((tab) => tab.url))
      .toEqual([appUrl])
    const app = this.context.pages().find((page) => page.url() === appUrl)
    if (!app) {
      throw new Error('The saved-tabs Domain app did not open.')
    }
    await expect(app.getByTestId('sortable-url-item')).toHaveCount(
      expectedUrls.length,
    )
    const hostnames = academyManifest.sites
      .map((site) => site.hostname)
      .toSorted()
    await expect
      .poll(async () =>
        (
          await app
            .getByTestId('domain-scroll-target')
            .getByRole('heading', { level: 2 })
            .allTextContents()
        ).toSorted(),
      )
      .toEqual(hostnames)
    const evidence: SaveFlowEvidence = {
      source: this.source,
      extensionId,
      expectedUrls,
      beforeTabs: this.before.tabs,
      afterTabs: await observeTabs(worker),
      isOnToolbar: (
        await worker.evaluate(async () => chrome.action.getUserSettings())
      ).isOnToolbar,
      clickBehavior: this.before.settings.clickBehavior ?? '',
      snapshot: await readPersistenceV2SavedTabsSnapshot(worker),
    }
    this.verification = validateSaveFlow(evidence)
    await this.saveJson('after.json', {
      ...evidence,
      validation: this.verification,
    })
    if (this.verification.status !== 'passed') {
      throw new Error(
        `Save verification failed: ${this.verification.errors.join(', ')}.`,
      )
    }
    await app.screenshot({
      path: path.join(this.runDir, 'domain.png'),
      fullPage: true,
    })
    console.log(
      'Save flow verified. Enter finish to finalize diagnostic page videos. Native install/pin/save clips still require the separate evidence gate.',
    )
  }

  async close() {
    if (this.closed) {
      return
    }
    try {
      await this.context.close()
      await rm(this.profileDir, { recursive: true, force: true })
      this.closed = true
    } catch (error) {
      await this.log('cleanup', 'failed', { error: errorMessage(error) })
      await this.saveSummary('failed')
      throw error
    }
    await this.saveSummary(
      this.stage === 'finished' ? 'pending-native-evidence' : 'failed',
    )
  }
}

const recordStartupFailure = async ({
  context,
  profileDir,
  runDir,
  source,
  browser,
  error,
}: {
  context: BrowserContext | undefined
  profileDir: string
  runDir: string
  source: RecordingSource
  browser: RecordingBrowser
  error: unknown
}) => {
  let screenshotError: string | null = null
  const page = context?.pages().at(-1)
  if (page) {
    try {
      await page.screenshot({ path: path.join(runDir, 'failure-launch.png') })
    } catch (captureError) {
      screenshotError = errorMessage(captureError)
    }
  }
  let profileRemoved = false
  let cleanupError: string | null = null
  try {
    await context?.close()
    await rm(profileDir, { recursive: true, force: true })
    profileRemoved = true
  } catch (closeError) {
    cleanupError = errorMessage(closeError)
  }
  const result = {
    status: 'failed',
    source,
    browser,
    profileRemoved,
    error: errorMessage(error),
    screenshotError,
    cleanupError,
  }
  await writeFile(
    path.join(runDir, 'result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  )
  await appendFile(
    path.join(runDir, 'operations.jsonl'),
    `${JSON.stringify({ at: new Date().toISOString(), command: 'launch', ...result })}\n`,
    { mode: 0o600 },
  )
}

/**
 * Starts a fresh profile with the verified Chrome for Testing channel by default.
 * Store-mode Chrome overrides require their own native capture setup.
 */
export const startRecordingSession = async (
  source: RecordingSource,
  browser: RecordingBrowser = 'chromium',
) => {
  const options = recordingLaunchOptions(source, browser)
  const baseDir = path.resolve('recordings', 'academy')
  await mkdir(baseDir, { recursive: true })
  const runDir = await mkdtemp(path.join(baseDir, 'poc-'))
  const profileDir = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-academy-poc-'),
  )
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      ...options,
      recordVideo: {
        dir: path.join(runDir, 'diagnostic-pages'),
        size: { width: 1280, height: 720 },
      },
    })
    const session = new RecordingSession({
      runDir,
      profileDir,
      source,
      browser,
      context,
    })
    if (source === 'chrome-web-store') {
      const page = context.pages()[0] ?? (await context.newPage())
      await page.goto(storeUrl)
    }
    console.log(
      JSON.stringify({
        status: 'awaiting-install',
        source,
        browser,
        runDir,
        profileDir,
        commands,
      }),
    )
    return session
  } catch (error) {
    await recordStartupFailure({
      context,
      profileDir,
      runDir,
      source,
      browser,
      error,
    })
    throw new Error(
      `Recording launch failed. Evidence: ${runDir}. ${errorMessage(error)}`,
      { cause: error },
    )
  }
}
