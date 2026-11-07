import {
  appendFile,
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  createBaseSeed,
  defaultUserSettings,
  getExtensionUrl,
  seedSavedTabsFixture,
} from '#academy-extension'
import type { PersistenceV2SavedTabsSeed } from '#academy-extension'
import { academyManifest } from '#academy-fixture'
import { chromium, expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { z } from 'zod'

export type PersistenceV2SavedTabsSnapshot = PersistenceV2SavedTabsSeed & {
  revision?: unknown
}

export type PageAction =
  | { type: 'assert-domains'; hostnames: string[] }
  | { type: 'assert-urls'; count: number }
  | { type: 'focus-domain'; hostname: string; holdSeconds: number }

export type CapturePageOptions = {
  runDir: string
  snapshot: PersistenceV2SavedTabsSnapshot
  actions: readonly PageAction[]
  viewport: { width: number; height: number }
  browserVersion: string
}

export type CapturePageResult = {
  file: string
  browserVersion: string
  contentStartSeconds: number
  durationSeconds: number
  actionLog: unknown[]
}

type LaunchOptions = NonNullable<
  Parameters<typeof chromium.launchPersistentContext>[1]
>

const hostnameSchema = z.enum(
  academyManifest.sites.map((site) => site.hostname),
)
const actionsSchema = z
  .array(
    z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('assert-domains'),
          hostnames: z
            .array(hostnameSchema)
            .min(1)
            .refine(
              (hostnames) => new Set(hostnames).size === hostnames.length,
              'Domain assertions must not contain duplicates.',
            ),
        })
        .strict(),
      z
        .object({
          type: z.literal('assert-urls'),
          count: z.number().int().nonnegative(),
        })
        .strict(),
      z
        .object({
          type: z.literal('focus-domain'),
          hostname: hostnameSchema,
          holdSeconds: z.number().min(0).max(30),
        })
        .strict(),
    ]),
  )
  .min(1)

export const captureLaunchOptions = (
  viewport: CapturePageOptions['viewport'],
): LaunchOptions => {
  if (
    !Number.isInteger(viewport.width) ||
    viewport.width <= 0 ||
    !Number.isInteger(viewport.height) ||
    viewport.height <= 0
  ) {
    throw new Error('Recording viewport must have positive integer dimensions.')
  }
  const extensionPath = path.resolve('.output', 'chrome-mv3')
  return {
    channel: 'chromium',
    headless: false,
    viewport,
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    offline: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const runPageAction = async (page: Page, action: PageAction): Promise<void> => {
  switch (action.type) {
    case 'assert-domains': {
      const headings = page
        .getByTestId('domain-scroll-target')
        .getByRole('heading', { level: 2 })
      await expect
        .poll(async () => (await headings.allTextContents()).toSorted())
        .toEqual(action.hostnames.toSorted())
      break
    }
    case 'assert-urls': {
      await expect
        .poll(async () => page.getByTestId('sortable-url-item').count())
        .toBe(action.count)
      break
    }
    case 'focus-domain': {
      const domain = page.locator('[data-tour="academy-domain"]').filter({
        has: page.getByRole('heading', { name: action.hostname, exact: true }),
      })
      await domain.waitFor({ state: 'visible' })
      await domain.scrollIntoViewIfNeeded()
      const previous = await domain.evaluate((element) => {
        const old = {
          outline: element.style.outline,
          outlineOffset: element.style.outlineOffset,
        }
        element.style.outline = '3px solid #16a34a'
        element.style.outlineOffset = '-3px'
        return old
      })
      try {
        await domain.hover()
        // This hold is reading time after visibility assertions, never readiness.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, action.holdSeconds * 1000)
        })
      } finally {
        await domain.evaluate((element, old) => {
          element.style.outline = old.outline
          element.style.outlineOffset = old.outlineOffset
        }, previous)
      }
      break
    }
    default: {
      throw new Error('Unsupported page action.')
    }
  }
}

type CaptureState = {
  context: BrowserContext | undefined
  page: Page | undefined
  recordingStarted: boolean
  traceStarted: boolean
  profileRemoved: boolean
  actionIndex: number | null
  actionLog: unknown[]
  errors: string[]
  browserVersion: string
  contentStartSeconds: number
  durationSeconds: number
}

const captureFailureScreenshot = async (state: CaptureState, root: string) => {
  const page = state.page ?? state.context?.pages().at(-1)
  if (page) {
    try {
      await page.screenshot({ path: path.join(root, 'capture-failure.png') })
    } catch (error) {
      state.errors.push(`Failure screenshot: ${errorMessage(error)}`)
    }
  }
}

const closeCapture = async (
  state: CaptureState,
  root: string,
  profile: string,
) => {
  if (state.errors.length > 0) {
    await captureFailureScreenshot(state, root)
  }
  if (state.page && state.recordingStarted) {
    try {
      await state.page.screencast.stop()
      state.recordingStarted = false
    } catch (error) {
      state.errors.push(`Video finalization: ${errorMessage(error)}`)
      await captureFailureScreenshot(state, root)
    }
  }
  if (state.context && state.traceStarted) {
    try {
      await state.context.tracing.stop({
        path: path.join(root, 'capture-trace.zip'),
      })
    } catch (error) {
      state.errors.push(`Trace finalization: ${errorMessage(error)}`)
      await captureFailureScreenshot(state, root)
    }
  }
  try {
    await state.context?.close()
    await rm(profile, { recursive: true, force: true })
    state.profileRemoved = true
  } catch (error) {
    state.errors.push(`Capture cleanup: ${errorMessage(error)}`)
    await captureFailureScreenshot(state, root)
  }
}

const prepareCapturePage = async (
  state: CaptureState,
  options: CapturePageOptions,
) => {
  const context = state.context
  if (!context) {
    throw new Error('The capture browser was not launched.')
  }
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 30_000 }))
  const extensionId = new URL(worker.url()).host
  await context.route('**/*', async (route) => {
    const url = URL.parse(route.request().url())
    if (url?.protocol === 'chrome-extension:' && url.host === extensionId) {
      await route.continue()
      return
    }
    await route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', async (socket) => {
    await socket.close({ code: 1008, reason: 'Academy capture is offline.' })
  })
  // Wait for the actual onInstalled setup before replacing this owned profile's data.
  await expect
    .poll(async () =>
      worker.evaluate(async () => {
        const values = await chrome.storage.local.get('changelogShown')
        return values.changelogShown
      }),
    )
    .toBe(true)
  await Promise.all(context.pages().map(async (page) => page.close()))
  await seedSavedTabsFixture(worker, {
    storage: createBaseSeed({
      'tab-manager-theme': 'light',
      userSettings: { ...defaultUserSettings, language: 'ja' },
    }),
    persistence: options.snapshot,
  })
  const page = await context.newPage()
  state.page = page
  await page.clock.setFixedTime(academyManifest.savedAt)
  await page.goto(
    getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
  )
  await expect
    .poll(async () => page.getByTestId('sortable-url-item').count())
    .toBe(options.snapshot.urls.length)
  return page
}

const verifyRecordedVideo = async (root: string, relative: string) => {
  const info = await stat(path.join(root, relative))
  if (!info.isFile() || info.size === 0) {
    throw new Error('Recorded video must be a nonempty regular file.')
  }
}

/** Records the real app after an explicit edit from a verified native save clip. */
export const capturePage = async (
  options: CapturePageOptions,
): Promise<CapturePageResult> => {
  const parsed = actionsSchema.safeParse(options.actions)
  if (!parsed.success) {
    throw new Error(`Invalid page actions: ${parsed.error.message}`)
  }
  const root = path.resolve(options.runDir)
  const videoDir = path.join(root, 'page-clips')
  const launchOptions = captureLaunchOptions(options.viewport)
  await mkdir(videoDir, { recursive: true })
  const profile = await mkdtemp(path.join(os.tmpdir(), 'tabbin-academy-page-'))
  const state: CaptureState = {
    context: undefined,
    page: undefined,
    recordingStarted: false,
    traceStarted: false,
    profileRemoved: false,
    actionIndex: null,
    actionLog: [],
    errors: [],
    browserVersion: '',
    contentStartSeconds: 0,
    durationSeconds: 0,
  }
  const file = 'page-clips/continuation.webm'
  try {
    state.context = await chromium.launchPersistentContext(
      profile,
      launchOptions,
    )
    await state.context.tracing.start({
      // Trace screenshots would start a smaller screencast before our requested size.
      screenshots: false,
      snapshots: true,
      sources: true,
    })
    state.traceStarted = true
    state.browserVersion = state.context.browser()?.version() ?? ''
    if (state.browserVersion !== options.browserVersion) {
      throw new Error(
        `Unexpected browser version: expected ${options.browserVersion}, observed ${state.browserVersion}.`,
      )
    }
    const page = await prepareCapturePage(state, options)
    await page.screencast.start({
      path: path.join(root, file),
      size: options.viewport,
      fps: 30,
    })
    state.recordingStarted = true
    const contentStartedAt = performance.now()
    // Actions are deliberately sequential: each assertion/focus observes the preceding step.
    for (const [index, action] of parsed.data.entries()) {
      state.actionIndex = index
      const startedAt = performance.now()
      // eslint-disable-next-line no-await-in-loop -- Scenario actions must run in declared order.
      await runPageAction(page, action)
      const entry = {
        index,
        action,
        status: 'passed',
        elapsedSeconds: (performance.now() - contentStartedAt) / 1000,
        durationSeconds: (performance.now() - startedAt) / 1000,
      }
      state.actionLog.push(entry)
      // eslint-disable-next-line no-await-in-loop -- Keep completed actions durable before continuing.
      await appendFile(
        path.join(root, 'capture-log.jsonl'),
        `${JSON.stringify(entry)}\n`,
        { mode: 0o600 },
      )
    }
    state.durationSeconds = (performance.now() - contentStartedAt) / 1000
    await page.screenshot({
      path: path.join(root, 'domain.png'),
      fullPage: true,
    })
  } catch (error) {
    state.errors.push(errorMessage(error))
    await appendFile(
      path.join(root, 'capture-log.jsonl'),
      `${JSON.stringify({ index: state.actionIndex, status: 'failed', error: errorMessage(error) })}\n`,
      { mode: 0o600 },
    )
  } finally {
    await closeCapture(state, root, profile)
  }
  if (state.errors.length === 0) {
    try {
      await verifyRecordedVideo(root, file)
    } catch (error) {
      state.errors.push(`Video finalization: ${errorMessage(error)}`)
    }
  }
  await writeFile(
    path.join(root, 'capture-result.json'),
    `${JSON.stringify(
      {
        status: state.errors.length === 0 ? 'passed' : 'failed',
        source: 'verified-native-save-continuation',
        browserVersion: state.browserVersion,
        timingMethod: 'on-demand-screencast-after-real-ui-readiness',
        contentStartSeconds: state.contentStartSeconds,
        durationSeconds: state.durationSeconds,
        actionIndex: state.actionIndex,
        actionLog: state.actionLog,
        errors: state.errors,
        profileRemoved: state.profileRemoved,
        file: state.errors.length === 0 ? file : null,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  )
  if (state.errors.length > 0) {
    throw new Error(state.errors.join('\n'))
  }
  return {
    file,
    browserVersion: state.browserVersion,
    contentStartSeconds: state.contentStartSeconds,
    durationSeconds: state.durationSeconds,
    actionLog: state.actionLog,
  }
}
