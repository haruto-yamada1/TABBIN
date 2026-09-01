import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { chromium } from '@playwright/test'
import type { BrowserContext, Worker } from '@playwright/test'

/**
 * Verifies a production artifact update without checking generated artifacts
 * into the repository. Build the previous tag separately, build the current
 * checkout, then provide both `.output/chrome-mv3` directories through
 * TABBIN_PREVIOUS_ARTIFACT_DIR and TABBIN_CURRENT_ARTIFACT_DIR. The optional
 * TABBIN_PREVIOUS_ARTIFACT_LABEL is included in the safe result summary.
 */
const previousArtifact = process.env.TABBIN_PREVIOUS_ARTIFACT_DIR
const currentArtifact = process.env.TABBIN_CURRENT_ARTIFACT_DIR
const previousArtifactLabel =
  process.env.TABBIN_PREVIOUS_ARTIFACT_LABEL ?? 'previous-production-artifact'
if (!previousArtifact || !currentArtifact) {
  throw new Error('Previous and current artifact directories are required')
}

const waitForWorker = async (context: BrowserContext): Promise<Worker> => {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  return worker
}

const launch = async (profileDir: string, addonDir: string) => {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${addonDir}`,
      `--load-extension=${addonDir}`,
    ],
  })
  return context
}

const readStorage = async (worker: Worker) =>
  worker.evaluate(async () => {
    const result = await chrome.storage.local.get([
      'customProjectOrder',
      'customProjects',
      'domainCategorySettings',
      'savedTabs',
      'urls',
      'tabbin:migrationPreflight:v1',
      'tabbin:persistenceControlState:v2',
    ])
    const customProjectOrder: unknown = result.customProjectOrder
    const customProjects: unknown = result.customProjects
    const domainCategorySettings: unknown = result.domainCategorySettings
    const savedTabs: unknown = result.savedTabs
    const urls: unknown = result.urls
    const migrationPreflight: unknown = result['tabbin:migrationPreflight:v1']
    const persistenceControlState: unknown =
      result['tabbin:persistenceControlState:v2']
    return {
      customProjectOrder,
      customProjects,
      domainCategorySettings,
      savedTabs,
      urls,
      'tabbin:migrationPreflight:v1': migrationPreflight,
      'tabbin:persistenceControlState:v2': persistenceControlState,
    }
  })

type StorageSnapshot = Awaited<ReturnType<typeof readStorage>>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readManifestVersion = async (artifactDirectory: string) => {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(artifactDirectory, 'manifest.json'), 'utf8'),
  )
  if (!isRecord(parsed) || typeof parsed.version !== 'string') {
    throw new Error('Artifact manifest version is invalid')
  }
  return parsed.version
}

const readControlStatus = (snapshot: StorageSnapshot): string | undefined => {
  const control = snapshot['tabbin:persistenceControlState:v2']
  return isRecord(control) && typeof control.status === 'string'
    ? control.status
    : undefined
}

const readPreflightSummary = (snapshot: StorageSnapshot) => {
  const preflight = snapshot['tabbin:migrationPreflight:v1']
  const diagnostic =
    isRecord(preflight) && isRecord(preflight.diagnostic)
      ? preflight.diagnostic
      : undefined
  return {
    capacityStatus:
      diagnostic && typeof diagnostic.capacityStatus === 'string'
        ? diagnostic.capacityStatus
        : undefined,
    collisionCount:
      diagnostic && typeof diagnostic.collisionCount === 'number'
        ? diagnostic.collisionCount
        : undefined,
    entityCounts:
      diagnostic && isRecord(diagnostic.entityCounts)
        ? diagnostic.entityCounts
        : undefined,
    issueCodes:
      isRecord(preflight) && Array.isArray(preflight.issueCodes)
        ? preflight.issueCodes.filter(
            (code): code is string => typeof code === 'string',
          )
        : undefined,
    status:
      isRecord(preflight) && typeof preflight.status === 'string'
        ? preflight.status
        : undefined,
  }
}

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'tabbin-artifact-upgrade-'),
)
const profileDir = path.join(temporaryRoot, 'profile')
const addonDir = path.join(temporaryRoot, 'addon')
const previousVersion = await readManifestVersion(previousArtifact)
const currentVersion = await readManifestVersion(currentArtifact)
assert.notEqual(currentVersion, previousVersion)
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html')
  response.end('<title>Production artifact legacy URL</title>legacy')
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') {
  throw new Error('Local smoke server did not start')
}

try {
  await cp(previousArtifact, addonDir, { recursive: true })
  let context = await launch(profileDir, addonDir)
  let worker = await waitForWorker(context)
  const extensionId = new URL(worker.url()).host
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      userSettings: { clickBehavior: 'saveCurrentTab' },
    })
  })
  const legacyPage = await context.newPage()
  await legacyPage.goto(`http://127.0.0.1:${address.port}/legacy`)
  await legacyPage.bringToFront()
  const browser = context.browser()
  assert.ok(browser)
  const cdp = await browser.newBrowserCDPSession()
  const { targetInfos } = await cdp.send('Target.getTargets', {
    filter: [{ type: 'tab' }],
  })
  const target = targetInfos.find(
    ({ type, url }) =>
      type === 'tab' && url === `http://127.0.0.1:${address.port}/legacy`,
  )
  assert.ok(target)
  await cdp.send('Extensions.triggerAction', {
    id: extensionId,
    targetId: target.targetId,
  })
  let legacy = await readStorage(worker)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (Array.isArray(legacy.savedTabs) && legacy.savedTabs.length > 0) {
      break
    }
    if (attempt > 0 && attempt % 10 === 0) {
      // eslint-disable-next-line no-await-in-loop -- retry targets the same active tab after observing no write
      await legacyPage.bringToFront()
      // eslint-disable-next-line no-await-in-loop -- action retry is condition-driven
      await cdp.send('Extensions.triggerAction', {
        id: extensionId,
        targetId: target.targetId,
      })
    }
    // eslint-disable-next-line no-await-in-loop -- condition polling is sequential by design
    await new Promise((resolve) => setTimeout(resolve, 100))
    // eslint-disable-next-line no-await-in-loop -- each read observes the preceding delay
    legacy = await readStorage(worker)
  }
  assert.ok(Array.isArray(legacy.savedTabs) && legacy.savedTabs.length > 0)
  assert.ok(Array.isArray(legacy.urls) && legacy.urls.length > 0)
  await worker.evaluate(async () => {
    const { savedTabs = [] } = await chrome.storage.local.get<{
      savedTabs?: Record<string, unknown>[]
    }>('savedTabs')
    if (savedTabs.length === 0) {
      throw new Error('Historical category drift requires a domain group.')
    }
    const firstGroup = savedTabs[0]
    const domain =
      typeof firstGroup.domain === 'string' ? firstGroup.domain : undefined
    if (!domain) {
      throw new Error('Historical category drift requires a domain group.')
    }
    await chrome.storage.local.set({
      domainCategorySettings: [
        {
          categoryKeywords: [
            { categoryName: 'old-category', keywords: ['stale'] },
          ],
          domain: `https://${domain}`,
          subCategories: ['old-category'],
        },
      ],
      savedTabs: [
        {
          ...firstGroup,
          categoryKeywords: [
            { categoryName: 'docs', keywords: ['reference'] },
            { categoryName: 'news', keywords: [] },
          ],
          subCategories: ['docs', 'news'],
          subCategoryOrder: ['news'],
          subCategoryOrderWithUncategorized: ['__uncategorized', 'news'],
        },
        ...savedTabs.slice(1),
      ],
    })
  })
  legacy = await readStorage(worker)
  await cdp.detach()
  await legacyPage.close()
  const legacyBefore = structuredClone({
    customProjectOrder: legacy.customProjectOrder,
    customProjects: legacy.customProjects,
    domainCategorySettings: legacy.domainCategorySettings,
    savedTabs: legacy.savedTabs,
    urls: legacy.urls,
  })
  await context.close()

  await rm(addonDir, { force: true, recursive: true })
  await cp(currentArtifact, addonDir, { recursive: true })
  context = await launch(profileDir, addonDir)
  worker = await waitForWorker(context)
  assert.equal(new URL(worker.url()).host, extensionId)
  const appPage = await context.newPage()
  await appPage.goto(`chrome-extension://${extensionId}/app.html#/saved-tabs`)

  let migrated = await readStorage(worker)
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (readControlStatus(migrated) === 'indexeddb') {
      break
    }
    // eslint-disable-next-line no-await-in-loop -- condition polling is sequential by design
    await new Promise((resolve) => setTimeout(resolve, 100))
    // eslint-disable-next-line no-await-in-loop -- each read observes the preceding delay
    migrated = await readStorage(worker)
  }
  const preflight = readPreflightSummary(migrated)
  const controlStatus = readControlStatus(migrated)
  console.log(
    JSON.stringify({
      control: controlStatus,
      preflight,
    }),
  )
  assert.equal(preflight.status, 'healthy')
  assert.equal(controlStatus, 'indexeddb')
  assert.deepEqual(
    {
      customProjectOrder: migrated.customProjectOrder,
      customProjects: migrated.customProjects,
      domainCategorySettings: migrated.domainCategorySettings,
      savedTabs: migrated.savedTabs,
      urls: migrated.urls,
    },
    legacyBefore,
  )
  await appPage
    .getByText('Production artifact legacy URL', { exact: true })
    .waitFor({ state: 'visible' })
  await appPage.goto(`chrome-extension://${extensionId}/app.html#/options`)
  const downloadPromise = appPage.waitForEvent('download')
  await appPage.getByRole('button', { name: /export|エクスポート/i }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  assert.ok(downloadPath)
  const exportedText = await readFile(downloadPath, 'utf8')
  const exported: unknown = JSON.parse(exportedText)
  assert.ok(isRecord(exported))
  assert.equal(exported.schemaVersion, 2)
  assert.ok(exportedText.includes(`http://127.0.0.1:${address.port}/legacy`))
  await appPage.close()
  await context.close()

  context = await launch(profileDir, addonDir)
  worker = await waitForWorker(context)
  const restarted = await readStorage(worker)
  assert.equal(readControlStatus(restarted), 'indexeddb')
  await context.close()
  console.log(
    JSON.stringify({
      extensionIdStable: true,
      fromVersion: previousVersion,
      legacySourceUnchanged: true,
      preflight: 'healthy',
      previousArtifact: previousArtifactLabel,
      restart: 'indexeddb',
      status: 'passed',
      toVersion: currentVersion,
    }),
  )
} finally {
  server.close()
  await rm(temporaryRoot, { force: true, recursive: true })
}
