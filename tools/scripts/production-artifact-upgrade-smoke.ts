import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { chromium } from '@playwright/test'
import type { BrowserContext, Worker } from '@playwright/test'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import * as persistence from '@/test/fixtures/persistenceBrowserFixtures'

/**
 * Build the previous IndexedDB-capable artifact and current checkout separately,
 * then provide their Chrome artifact directories through the two environment
 * variables below. The same installed profile is reused across the update and
 * restart. Development artifacts may have the same manifest version.
 */
const previousArtifact = process.env.TABBIN_PREVIOUS_ARTIFACT_DIR
const currentArtifact = process.env.TABBIN_CURRENT_ARTIFACT_DIR
const previousArtifactLabel =
  process.env.TABBIN_PREVIOUS_ARTIFACT_LABEL ?? 'previous-indexeddb-artifact'
if (!previousArtifact || !currentArtifact) {
  throw new Error('Previous and current artifact directories are required')
}
assert.notEqual(path.resolve(previousArtifact), path.resolve(currentArtifact))

const waitForWorker = async (context: BrowserContext): Promise<Worker> =>
  context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker')

const launch = async (profileDir: string, addonDir: string) =>
  chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${addonDir}`,
      `--load-extension=${addonDir}`,
    ],
  })

const readManifestVersion = async (artifactDirectory: string) => {
  const manifest: unknown = JSON.parse(
    await readFile(path.join(artifactDirectory, 'manifest.json'), 'utf8'),
  )
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error('Production artifact manifest must have a version.')
  }
  return manifest.version
}

const readIndexedDbSnapshot = async (worker: Worker) =>
  worker.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabbin-persistence-v2', 1)
      request.addEventListener('success', () => {
        resolve(request.result)
      })
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('IndexedDB open failed.'))
      })
    })
    const stores = [...database.objectStoreNames]
    const transaction = database.transaction(stores, 'readonly')
    const requests = stores.map((name) => ({
      name,
      request: transaction.objectStore(name).getAll(),
    }))
    try {
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => {
          resolve()
        })
        transaction.addEventListener('abort', () => {
          reject(transaction.error ?? new Error('IndexedDB snapshot aborted.'))
        })
        transaction.addEventListener('error', () => {
          reject(transaction.error ?? new Error('IndexedDB snapshot failed.'))
        })
      })
      return Object.fromEntries(
        requests.map(({ name, request }) => [name, request.result]),
      )
    } finally {
      database.close()
    }
  })

const userSettingsSeed = {
  activeAiSystemPromptId: 'prompt-1',
  aiSystemPrompts: [
    {
      createdAt: 1,
      id: 'prompt-1',
      name: 'Upgrade prompt',
      template: 'Summarize the saved tabs.',
      updatedAt: 2,
    },
  ],
  autoDeletePeriod: 'never',
  clickBehavior: 'saveCurrentTab',
  colors: { primary: '#123456' },
  confirmDeleteAll: false,
  confirmDeleteEach: false,
  enableCategories: true,
  excludePatterns: ['example.com'],
  excludePinnedTabs: true,
  language: 'en',
  ollamaModel: 'upgrade-model',
  openAllInNewWindow: false,
  openUrlInBackground: true,
  removeTabAfterExternalDrop: true,
  removeTabAfterOpen: false,
  showRelativeSavedTime: true,
  showSavedTime: true,
  showOpenTabs: true,
}

const seed = {
  analyticsViews: [{ id: 'view-1', updatedAt: 2, value: { kind: 'weekly' } }],
  collectionCategories: [
    {
      collectionId: 'collection-domain',
      createdAt: 1,
      id: 'category-docs',
      keywords: ['reference'],
      name: 'docs',
      sortOrder: 0,
      updatedAt: 1,
    },
    {
      collectionId: 'collection-custom',
      createdAt: 1,
      id: 'category-research',
      keywords: [],
      name: 'research',
      sortOrder: 0,
      updatedAt: 1,
    },
  ],
  collectionGroups: [],
  collectionMemberships: [
    {
      ...persistence.createMembershipFixture(
        'collection-domain',
        'url-domain',
        2,
      ),
      categoryId: 'category-docs',
    },
    {
      ...persistence.createMembershipFixture(
        'collection-custom',
        'url-custom',
        3,
      ),
      categoryId: 'category-research',
      notes: 'upgrade private note',
    },
  ],
  collections: [
    persistence.createDomainCollectionFixture(
      'collection-domain',
      'example.com',
      1,
    ),
    persistence.createCustomCollectionFixture(
      'collection-custom',
      'Upgrade project',
      1,
      1024,
    ),
  ],
  conversations: [
    {
      id: 'conversation-1',
      updatedAt: 2,
      value: { title: 'Upgrade conversation' },
    },
  ],
  messages: [
    {
      conversationId: 'conversation-1',
      createdAt: 2,
      id: 'message-1',
      value: { content: 'Upgrade message', role: 'user' },
    },
  ],
  metadata: [{ key: 'revision', value: 7 }],
  urls: [
    persistence.createUrlFixture(
      'url-domain',
      'https://example.com/domain',
      'Production IndexedDB URL',
      2,
    ),
    {
      ...persistence.createUrlFixture(
        'url-custom',
        'https://example.com/custom',
        'Production custom URL',
        3,
      ),
      isFavorite: true,
    },
  ],
}

const seedIndexedDb = async (worker: Worker): Promise<void> => {
  await worker.evaluate(async (value) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tabbin-persistence-v2', 1)
      request.addEventListener('success', () => {
        resolve(request.result)
      })
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('IndexedDB seed open failed.'))
      })
    })
    const transaction = database.transaction(Object.keys(value), 'readwrite')
    for (const [name, records] of Object.entries(value)) {
      const store = transaction.objectStore(name)
      store.clear()
      for (const record of records) {
        store.put(record)
      }
    }
    try {
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => {
          resolve()
        })
        transaction.addEventListener('abort', () => {
          reject(transaction.error ?? new Error('IndexedDB seed aborted.'))
        })
        transaction.addEventListener('error', () => {
          reject(transaction.error ?? new Error('IndexedDB seed failed.'))
        })
      })
    } finally {
      database.close()
    }
  }, seed)
}

const readObsoleteStorage = async (worker: Worker) =>
  worker.evaluate(
    async (keys) => chrome.storage.local.get(keys),
    Object.keys(persistence.obsoletePersistenceStorageFixture),
  )

const readUserSettings = async (worker: Worker) =>
  worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('userSettings')
    return stored.userSettings
  })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const assertUserSettingsPreserved = (settings: unknown): void => {
  if (!isRecord(settings)) {
    throw new Error('User settings were not preserved during the upgrade.')
  }
  assert.equal(settings.language, userSettingsSeed.language)
  assert.equal(settings.ollamaModel, userSettingsSeed.ollamaModel)
  assert.equal(settings.removeTabAfterOpen, userSettingsSeed.removeTabAfterOpen)
  assert.equal(settings.showSavedTime, userSettingsSeed.showSavedTime)
  assert.equal(
    settings.showRelativeSavedTime,
    userSettingsSeed.showRelativeSavedTime,
  )
  assert.equal(
    settings.activeAiSystemPromptId,
    userSettingsSeed.activeAiSystemPromptId,
  )
  assert.deepEqual(settings.aiSystemPrompts, userSettingsSeed.aiSystemPrompts)
  assert.deepEqual(settings.colors, userSettingsSeed.colors)
  const excludePatterns = settings.excludePatterns
  assert.ok(Array.isArray(excludePatterns))
  assert.ok(excludePatterns.includes('example.com'))
}

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'tabbin-artifact-upgrade-'),
)
const profileDir = path.join(temporaryRoot, 'profile')
const addonDir = path.join(temporaryRoot, 'addon')
const previousVersion = await readManifestVersion(previousArtifact)
const currentVersion = await readManifestVersion(currentArtifact)
let context: BrowserContext | undefined

try {
  await cp(previousArtifact, addonDir, { recursive: true })
  context = await launch(profileDir, addonDir)
  let worker = await waitForWorker(context)
  const extensionId = new URL(worker.url()).host
  let appPage = await context.newPage()
  await appPage.goto(`chrome-extension://${extensionId}/app.html#/options`)
  await appPage
    .getByRole('button', { name: /export|エクスポート/i })
    .waitFor({ state: 'visible' })
  await seedIndexedDb(worker)
  const indexedDbBefore = await readIndexedDbSnapshot(worker)
  assert.equal(indexedDbBefore.urls?.length, 2)
  await worker.evaluate(
    async ({ settings, values }) => {
      await chrome.storage.local.set({ ...values, userSettings: settings })
    },
    {
      settings: userSettingsSeed,
      values: persistence.obsoletePersistenceStorageFixture,
    },
  )
  const obsoleteStorageBefore = await readObsoleteStorage(worker)
  await context.close()
  context = undefined

  await rm(addonDir, { force: true, recursive: true })
  await cp(currentArtifact, addonDir, { recursive: true })
  context = await launch(profileDir, addonDir)
  worker = await waitForWorker(context)
  assert.equal(new URL(worker.url()).host, extensionId)
  appPage = await context.newPage()
  await appPage.goto(
    `chrome-extension://${extensionId}/app.html#/saved-tabs?mode=domain`,
  )
  await appPage
    .getByText('Production IndexedDB URL', { exact: true })
    .waitFor({ state: 'visible' })
  assert.deepEqual(await readIndexedDbSnapshot(worker), indexedDbBefore)
  assert.deepEqual(await readObsoleteStorage(worker), obsoleteStorageBefore)
  assertUserSettingsPreserved(await readUserSettings(worker))
  await appPage.goto(
    `chrome-extension://${extensionId}/app.html#/saved-tabs?mode=custom`,
  )
  await appPage
    .getByText('Upgrade project', { exact: true })
    .waitFor({ state: 'visible' })
  await appPage
    .getByText('Production custom URL', { exact: true })
    .waitFor({ state: 'visible' })
  const favoriteButton = appPage.getByRole('button', {
    name: 'Favorite: Production custom URL',
  })
  await favoriteButton.waitFor({ state: 'visible' })
  assert.equal(await favoriteButton.getAttribute('aria-pressed'), 'true')
  await appPage.goto(`chrome-extension://${extensionId}/app.html#/options`)
  const downloadPromise = appPage.waitForEvent('download')
  await appPage.getByRole('button', { name: /export|エクスポート/i }).click()
  const preview = appPage.getByRole('dialog', { name: 'Export Preview' })
  await preview
    .getByRole('checkbox', { name: 'Saved tabs', exact: true })
    .check()
  await preview.getByRole('checkbox', { name: 'Settings', exact: true }).check()
  await preview
    .getByRole('checkbox', { name: 'AI chat history', exact: true })
    .check()
  await preview
    .getByRole('checkbox', { name: 'Analytics views', exact: true })
    .check()
  await preview.getByRole('button', { name: 'Download JSON backup' }).click()
  const downloadPath = await (await downloadPromise).path()
  assert.ok(downloadPath)
  const exported = BackupEnvelopeV2Schema.parse(
    JSON.parse(await readFile(downloadPath, 'utf8')),
  )
  assert.equal(exported.schemaVersion, 2)
  assert.equal(exported.data.savedTabs.urls.length, 2)
  assert.equal(exported.data.savedTabs.categories.length, 2)
  assert.equal(exported.data.savedTabs.memberships.length, 2)
  assert.equal(
    exported.data.savedTabs.urls.find((url) => url.id === 'url-custom')
      ?.isFavorite,
    true,
  )
  assert.equal(
    exported.data.savedTabs.memberships.find(
      (membership) => membership.collectionId === 'collection-custom',
    )?.notes,
    'upgrade private note',
  )
  assert.equal(exported.data.conversations.length, 1)
  assert.equal(exported.data.messages.length, 1)
  assert.equal(exported.data.analyticsViews.length, 1)
  assert.equal(exported.data.userSettings.language, 'en')
  assert.equal(exported.data.userSettings.ollamaModel, 'upgrade-model')
  assert.deepEqual(
    exported.data.userSettings.aiSystemPrompts,
    userSettingsSeed.aiSystemPrompts,
  )
  await context.close()
  context = undefined

  context = await launch(profileDir, addonDir)
  worker = await waitForWorker(context)
  appPage = await context.newPage()
  await appPage.goto(
    `chrome-extension://${extensionId}/app.html#/saved-tabs?mode=domain`,
  )
  await appPage
    .getByText('Production IndexedDB URL', { exact: true })
    .waitFor({ state: 'visible' })
  assert.deepEqual(await readIndexedDbSnapshot(worker), indexedDbBefore)
  assert.deepEqual(await readObsoleteStorage(worker), obsoleteStorageBefore)
  assertUserSettingsPreserved(await readUserSettings(worker))
  console.log(
    JSON.stringify({
      aiHistoryPreserved: true,
      backupV2SchemaVersion: exported.schemaVersion,
      extensionIdStable: true,
      favoritesPreserved: true,
      fromVersion: previousVersion,
      indexedDbRowsPreserved: true,
      notesPreserved: true,
      obsoleteMetadataIgnored: true,
      previousArtifact: previousArtifactLabel,
      restarts: ['indexeddb', 'backup-v2'],
      settingsPreserved: true,
      status: 'passed',
      toVersion: currentVersion,
    }),
  )
} finally {
  await context?.close()
  await rm(temporaryRoot, { force: true, recursive: true })
}
