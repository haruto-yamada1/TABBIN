import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { chromium } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import { z } from 'zod'

import { fingerprintArtifact } from './artifactSizeReport'
import { withFirefoxExtension } from './firefoxExtensionSession'
import {
  initialLoadReadyScript,
  isInitialLoadReady,
  loadScenarios,
  parseLoadObservations,
} from './initialLoadReport'
import { InitialLoadTracker } from './initialLoadTracker'

const root = path.resolve(import.meta.dirname, '../..')
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const features = Object.entries(loadScenarios)
const pollSnapshot = async (
  read: () => Promise<unknown>,
): Promise<string[]> => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- readiness polling is sequential
    const result = await read()
    if (result !== null) {
      return z.array(z.string()).min(1).parse(result)
    }
    // eslint-disable-next-line no-await-in-loop -- bounded browser readiness polling
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    'Initial-load screen did not become ready with settled JavaScript',
  )
}

const measureChrome = async (
  directory: string,
  route: string,
  ready: string,
) => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'tabbin-load-chrome-'))
  let context: BrowserContext | undefined
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      locale: 'en-US',
      args: [
        `--disable-extensions-except=${directory}`,
        `--load-extension=${directory}`,
      ],
    })
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'))
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ userSettings: { language: 'en' } })
    })
    const page = await context.newPage()
    const origin = `chrome-extension://${new URL(worker.url()).host}`
    const tracker = new InitialLoadTracker(origin)
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Debugger.enable')
    cdp.on('Debugger.scriptParsed', ({ url }) => {
      tracker.parsed(url)
    })
    cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
      tracker.started(requestId, request.url)
    })
    cdp.on('Network.loadingFinished', ({ requestId }) => {
      tracker.finished(requestId)
    })
    cdp.on('Network.loadingFailed', ({ requestId }) => {
      tracker.failed(requestId)
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    // Fresh document and module map per feature; no earlier feature navigation.
    await page.goto(`${origin}/${route}`)
    const files = await pollSnapshot(async () =>
      tracker.snapshot(await page.evaluate(isInitialLoadReady, ready)),
    )
    if (errors.length) {
      throw new Error(`Initial load JavaScript error: ${errors.join('; ')}`)
    }
    return { files, version: context.browser()?.version() ?? 'unknown' }
  } finally {
    try {
      await context?.close()
    } finally {
      await rm(profile, { recursive: true, force: true })
    }
  }
}

export const measureInitialLoads = async () => {
  const browsers: Record<string, unknown> = {}
  for (const browser of ['chrome', 'firefox'] as const) {
    const directory = path.join(
      root,
      '.output',
      browser === 'chrome' ? 'chrome-mv3' : 'firefox-mv2',
    )
    const artifactSha256 = fingerprintArtifact(directory)
    const observations: Record<string, string[]> = {}
    let browserVersion = ''
    for (const [feature, { route, ready }] of features) {
      // Each engine/feature owns a fresh profile; serialize to avoid measurement contention.
      /* eslint-disable no-await-in-loop */
      const result =
        browser === 'chrome'
          ? await measureChrome(directory, route, ready)
          : await withFirefoxExtension(directory, async (session) => {
              await session.navigate(route)
              let previous = ''
              let settledAt = Date.now()
              const files = await pollSnapshot(async () => {
                if (
                  !(await session.evaluate(initialLoadReadyScript, [ready]))
                ) {
                  return null
                }
                const sources = await session.parsedJavaScript()
                const next = JSON.stringify(sources)
                if (next !== previous) {
                  previous = next
                  settledAt = Date.now()
                }
                return sources.length && Date.now() - settledAt >= 500
                  ? sources
                  : null
              })
              return { files, version: session.version }
            })
      /* eslint-enable no-await-in-loop */
      observations[feature] = result.files
      browserVersion = result.version
      console.log(
        `${browser}/${feature}: ${result.files.length} initial JS resources`,
      )
    }
    if (fingerprintArtifact(directory) !== artifactSha256) {
      throw new Error('Artifact changed during measurement')
    }
    browsers[browser] = {
      artifactSha256,
      browserVersion,
      features: observations,
    }
  }
  const observations = parseLoadObservations({
    schemaVersion: 1,
    scenario: 'fresh-profile-empty-en-v1',
    method: 'parsed-module-sources-v1',
    revision,
    environment: `${process.platform}/${process.arch}; Node ${process.versions.node}; Bun ${execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim()}`,
    browsers,
  })
  const output = path.join(root, '.output/size-report')
  mkdirSync(output, { recursive: true })
  writeFileSync(
    path.join(output, 'initial-load-observations.json'),
    `${JSON.stringify(observations, null, 2)}\n`,
  )

  return observations
}
