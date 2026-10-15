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
type UrlRows = ReturnType<typeof createExamplePersistenceFixture>['urls']
const corruptUrls = {
  'missing-url': (_rows: UrlRows) => [],
  'nonnumeric-date': (rows: UrlRows) =>
    rows.map((row) => ({ ...row, firstSavedAt: 'not-a-number' })),
}
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
  for (const corruption of ['missing-url', 'nonnumeric-date'] as const) {
    test(`${corruption} shows recovery, retains failed retry and downloads saved-tab rescue data`, async ({
      extensionId,
      page,
      serviceWorker,
    }, testInfo) => {
      const fixture = createExamplePersistenceFixture(now)
      const corrupted = {
        ...fixture,
        urls: corruptUrls[corruption](fixture.urls),
      }
      await seedSavedTabsFixture(serviceWorker, {
        persistence: corrupted,
        storage: createBaseSeed(),
      })
      const before = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      await page.goto(
        getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
      )
      const alert = page
        .getByRole('alert')
        .filter({ hasText: 'Storage recovery required' })
      await expect(alert).toBeVisible()
      await alert.getByRole('button', { name: 'Retry', exact: true }).click()
      await expect(
        alert.getByRole('button', { name: 'Retry', exact: true }),
      ).toBeEnabled()
      await expect(alert).toBeVisible()
      await alert.getByText('Error code', { exact: true }).click()
      await expect(alert).toContainText('PERSISTENCE_RECOVERY_REQUIRED')
      await expect(alert).not.toContainText('not-a-number')
      const downloading = page.waitForEvent('download')
      await alert
        .getByRole('button', { name: 'Export saved-tab recovery data' })
        .click()
      const download = await downloading
      expect(download.suggestedFilename()).toMatch(
        /^tabbin-saved-tabs-recovery-/,
      )
      const downloadPath = await download.path()
      expect(downloadPath).toBeTruthy()
      const rescue: unknown = JSON.parse(
        await readFile(downloadPath as string, 'utf8'),
      )
      expect(rescue).toMatchObject({
        encoding: 'tagged-json-v1',
        format: 'tabbin-saved-tabs-recovery',
        stores: {
          collectionMemberships: ['json', before.memberships],
          urls: ['json', before.urls],
        },
      })
      expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
        before,
      )
      await page.screenshot({
        path: testInfo.outputPath('corrupt-record-recovery.png'),
      })
      await page.reload()
      await expect(alert).toBeVisible()
    })
  }

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

  test(
    'Backup V2のエクスポートファイルを実際のインポートUIで復元できる',
    { tag: '@release-backup-v2' },
    async ({ extensionId, page, serviceWorker }) => {
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
    },
  )
})
