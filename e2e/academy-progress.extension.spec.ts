import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
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

const builtArtifact = path.join(process.cwd(), '.output/chrome-mv3')
const snapshotArtifact = async () => {
  const entries = await readdir(builtArtifact, {
    recursive: true,
    withFileTypes: true,
  })
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filename = path.join(entry.parentPath, entry.name)
        return {
          path: path.relative(builtArtifact, filename),
          sha256: createHash('sha256')
            .update(await readFile(filename))
            .digest('hex'),
        }
      }),
  )
  return files.toSorted((left, right) =>
    left.path.localeCompare(right.path, 'en'),
  )
}
const loadHarness = async (context: BrowserContext): Promise<Page> => {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const page = await context.newPage()
  const extensionId = new URL(worker.url()).host
  // Startup closes duplicate saved-tabs pages. The progress harness needs only
  // the Academy origin, so use its route when opening concurrent/restarted tabs.
  await page.goto(`chrome-extension://${extensionId}/app.html#/academy`)
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
  const artifactBefore = await snapshotArtifact()
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'tabbin-academy-'))
  const artifact = path.join(temporaryRoot, 'extension')
  const profile = path.join(temporaryRoot, 'profile')
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
  let context: BrowserContext | undefined
  try {
    await cp(builtArtifact, artifact, { recursive: true })
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
    context = await launch()
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
    context = undefined
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
    try {
      await context?.close()
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }
  expect(await snapshotArtifact(), 'built extension remains unchanged').toEqual(
    artifactBefore,
  )
  expect(
    [...violations],
    'unexpected outbound request from an extension page or service worker',
  ).toEqual([])
})
