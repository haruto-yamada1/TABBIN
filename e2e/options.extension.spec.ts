import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import {
  createEmptyPersistenceFixture,
  createExamplePersistenceFixture,
  createUrlFixture,
  obsoletePersistenceStorageFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  readStorage,
  seedPersistenceV2SavedTabs,
  seedSavedTabsFixture,
  seedStorage,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

const now = Date.now()
const createSeedWithUrls = () => {
  const persistence = createExamplePersistenceFixture(now)
  return {
    persistence: {
      ...persistence,
      urls: [
        ...persistence.urls,
        createUrlFixture(
          'url-orphan',
          'https://orphan.example/',
          'Orphan URL',
          now - 1,
        ),
      ],
    },
    storage: createBaseSeed(),
  }
}

test.describe('extension options', () => {
  test('fresh IndexedDB starts without writing migration metadata', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBaseSeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    await waitForPersistenceV2Ready(serviceWorker)
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible()
    expect(
      await readStorage(serviceWorker, [
        'tabbin:persistenceControlState:v2',
        'tabbin:migrationPreflight:v1',
      ]),
    ).toEqual({})
    const snapshot = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(snapshot.urls).toEqual([])
    expect(snapshot.collections).toEqual([])
  })

  for (const status of [
    'legacy',
    'migrating',
    'verifying',
    'failed',
    'read-only-emergency',
  ]) {
    test(`obsolete ${status} control metadata does not block IndexedDB`, async ({
      extensionId,
      page,
      serviceWorker,
    }) => {
      const obsoleteStorage = {
        ...obsoletePersistenceStorageFixture,
        'tabbin:persistenceControlState:v2': { status },
      }
      await seedSavedTabsFixture(serviceWorker, {
        persistence: createExamplePersistenceFixture(now),
        storage: createBaseSeed(obsoleteStorage),
      })
      await page.goto(
        getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
      )
      await waitForPersistenceV2Ready(serviceWorker)
      await expect(page.getByText('Example Home')).toBeVisible()
      await expect(
        page.getByText('obsolete.example', { exact: true }),
      ).toBeHidden()
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'Storage recovery required' }),
      ).toBeHidden()
      await page.reload()
      await expect(page.getByText('Example Home')).toBeVisible()
      expect(
        await readStorage(serviceWorker, Object.keys(obsoleteStorage)),
      ).toEqual(obsoleteStorage)
    })
  }

  for (const failureMode of ['open', 'unavailable'] as const) {
    test(`IndexedDB ${failureMode} failure exposes recovery and retry restores the existing rows`, async ({
      extensionId,
      page,
      serviceWorker,
    }, testInfo) => {
      await seedSavedTabsFixture(serviceWorker, {
        persistence: createExamplePersistenceFixture(now),
        storage: createBaseSeed(obsoletePersistenceStorageFixture),
      })
      await page.addInitScript((mode) => {
        const runtime = globalThis as typeof globalThis & {
          __failIndexedDbOpen?: boolean
          __restoreIndexedDb?: () => void
        }
        const factory = indexedDB
        runtime.__restoreIndexedDb = () => {
          runtime.__failIndexedDbOpen = false
          Object.defineProperty(globalThis, 'indexedDB', {
            configurable: true,
            value: factory,
          })
        }
        if (mode === 'unavailable') {
          Object.defineProperty(globalThis, 'indexedDB', {
            configurable: true,
            value: undefined,
          })
          return
        }
        runtime.__failIndexedDbOpen = true
        const open = indexedDB.open.bind(indexedDB)
        indexedDB.open = (name, version) => {
          if (runtime.__failIndexedDbOpen) {
            throw new Error('forced browser IndexedDB open failure')
          }
          return open(name, version)
        }
      }, failureMode)
      await page.goto(
        getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
      )
      const recoveryAlert = page
        .getByRole('alert')
        .filter({ hasText: 'Storage recovery required' })
      await expect(recoveryAlert).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('indexeddb-recovery.png'),
      })
      await expect(page.getByText('Example Home')).toBeHidden()
      await page.evaluate(() => {
        const runtime = globalThis as typeof globalThis & {
          __restoreIndexedDb?: () => void
        }
        runtime.__restoreIndexedDb?.()
      })
      await recoveryAlert.getByRole('button', { name: /retry/i }).click()
      await expect(recoveryAlert).toBeHidden()
      await expect(page.getByText('Example Home')).toBeVisible()
      expect(
        await readStorage(
          serviceWorker,
          Object.keys(obsoletePersistenceStorageFixture),
        ),
      ).toEqual(obsoletePersistenceStorageFixture)
    })
  }

  test('設定をBackup V2でエクスポートできる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createSeedWithUrls())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    await waitForPersistenceV2Ready(serviceWorker)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const downloadPath = await (await downloadPromise).path()
    expect(downloadPath).toBeTruthy()
    const fileContent = await readFile(downloadPath as string, 'utf8')
    const backup = BackupEnvelopeV2Schema.parse(JSON.parse(fileContent))
    expect(backup.schemaVersion).toBe(2)
    expect(backup.data.savedTabs.urls).toHaveLength(2)
    expect(backup.data.savedTabs.urls[0]?.url).toBe('https://example.com/')
    expect(backup.data.savedTabs.collections).toHaveLength(1)
    expect(backup.data.savedTabs.collections[0]?.definition).toEqual({
      domain: 'example.com',
      type: 'domain',
    })
    expect(backup.data.userSettings).not.toHaveProperty('activeAiSystemPrompt')
  })

  test('Backup V2のエクスポートファイルを実際のインポートUIで復元できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedSavedTabsFixture(serviceWorker, createSeedWithUrls())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    await waitForPersistenceV2Ready(serviceWorker)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const downloadPath = await (await downloadPromise).path()
    expect(downloadPath).toBeTruthy()
    const fileContent = await readFile(downloadPath as string, 'utf8')
    const backup = BackupEnvelopeV2Schema.parse(JSON.parse(fileContent))
    expect(backup.data.savedTabs.urls).toHaveLength(2)
    expect(backup.data.savedTabs.collections).toHaveLength(1)
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tabbin-import-v2-'))
    try {
      const tmpFilePath = path.join(tmpDir, 'tabbin-backup-v2.json')
      await writeFile(tmpFilePath, fileContent)
      await seedPersistenceV2SavedTabs(
        serviceWorker,
        createEmptyPersistenceFixture(),
      )
      await page.getByRole('button', { name: /import/i }).click()
      await page
        .locator('[data-testid="hidden-file-input"]')
        .setInputFiles(tmpFilePath)
      await expect(
        page.getByRole('button', { name: /confirm.*import/i }),
      ).toBeVisible()
      await page.getByRole('button', { name: /confirm.*import/i }).click()
      await expect(
        page.getByRole('button', { name: /confirm.*import/i }),
      ).toBeHidden()
      await page.goto(
        getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
      )
      await expect(page.getByText('Example Home')).toBeVisible()
      await page.reload()
      await expect(page.getByText('Example Home')).toBeVisible()
    } finally {
      await rm(tmpDir, { force: true, recursive: true })
    }
  })
})
