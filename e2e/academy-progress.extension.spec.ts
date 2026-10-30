import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { chromium, expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

import type { createAcademyUseCases } from '@/app/composition/createAcademyUseCases'
import { createExamplePersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

import {
  readPersistenceV2SavedTabsSnapshot,
  seedPersistenceV2SavedTabs,
} from './helpers/extension'
import { getUnexpectedPlaywrightExtensionOutboundRequest } from './helpers/network-policy'
import type { runAcademyPersistenceSmoke } from './support/academy-progress-browser-harness'

declare global {
  var __tabbinAcademySmoke: ReturnType<typeof createAcademyUseCases> & {
    runAcademyPersistenceSmoke: typeof runAcademyPersistenceSmoke
  }
}

const artifact = path.join(process.cwd(), '.output/chrome-mv3')
const loadHarness = async (context: BrowserContext): Promise<Page> => {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const page = await context.newPage()
  const extensionId = new URL(worker.url()).host
  await page.goto(`chrome-extension://${extensionId}/app.html#/saved-tabs`)
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const element = document.createElement('script')
      element.src = chrome.runtime.getURL('academy-progress-browser-harness.js')
      element.addEventListener('load', () => resolve())
      element.addEventListener('error', () =>
        reject(new Error('Academy harness failed to load')),
      )
      document.documentElement.append(element)
    })
  })
  return page
}

test('Academy progress survives browser restart and concurrent tabs without changing saved data', async () => {
  execFileSync(
    'bun',
    [
      'build',
      'e2e/support/academy-progress-browser-harness.ts',
      `--outfile=${artifact}/academy-progress-browser-harness.js`,
      '--target=browser',
      '--format=iife',
    ],
    { stdio: 'pipe' },
  )
  const profile = await mkdtemp(path.join(os.tmpdir(), 'tabbin-academy-'))
  const violations = new Set<string>()
  const launch = async () => {
    const launched = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${artifact}`,
        `--load-extension=${artifact}`,
      ],
    })
    launched.on('request', (request) => {
      const violation = getUnexpectedPlaywrightExtensionOutboundRequest(request)
      if (violation !== null) {
        violations.add(violation)
      }
    })
    return launched
  }
  let context = await launch()
  try {
    const page = await loadHarness(context)
    const savedTabs = createExamplePersistenceFixture(Date.now())
    await seedPersistenceV2SavedTabs(page, savedTabs)
    await page.evaluate(async () => {
      await chrome.storage.local.set({ academyUnrelatedMarker: 'preserve' })
    })
    const other = await loadHarness(context)
    const before = await readPersistenceV2SavedTabsSnapshot(page)
    expect(before.urls).toEqual(savedTabs.urls)
    expect(before.collections).toEqual(savedTabs.collections)
    expect(before.memberships).toEqual(savedTabs.memberships)
    const [attempt, concurrentAttempt] = await Promise.all([
      page.evaluate(async () =>
        globalThis.__tabbinAcademySmoke.startLesson('install-extension'),
      ),
      other.evaluate(async () =>
        globalThis.__tabbinAcademySmoke.startLesson('install-extension'),
      ),
    ])
    expect(concurrentAttempt).toEqual(attempt)
    await Promise.all([
      page.evaluate(
        async (attempt) => globalThis.__tabbinAcademySmoke.skipLesson(attempt),
        attempt,
      ),
      other.evaluate(async () =>
        globalThis.__tabbinAcademySmoke.recordIntro('dismiss'),
      ),
    ])
    const expected = await page.evaluate(async () =>
      globalThis.__tabbinAcademySmoke.runAcademyPersistenceSmoke('fresh'),
    )
    expect(await readPersistenceV2SavedTabsSnapshot(page)).toEqual(before)
    await context.close()
    context = await launch()
    const restarted = await loadHarness(context)
    expect(
      await restarted.evaluate(async () =>
        globalThis.__tabbinAcademySmoke.runAcademyPersistenceSmoke('verify'),
      ),
    ).toEqual(expected)
    expect(await readPersistenceV2SavedTabsSnapshot(restarted)).toEqual(before)
    expect(
      await restarted.evaluate(
        async () =>
          (await chrome.storage.local.get('academyUnrelatedMarker'))
            .academyUnrelatedMarker,
      ),
    ).toBe('preserve')
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true })
  }
  expect(
    [...violations],
    'unexpected outbound request from an extension page or service worker',
  ).toEqual([])
})
