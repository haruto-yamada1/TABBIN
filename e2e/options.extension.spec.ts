import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedPersistenceV2SavedTabs,
  seedStorage,
  test,
  waitForPersistenceV2Ready,
} from './helpers/extension'

const now = Date.now()

const createSeedWithUrls = () =>
  createBaseSeed({
    savedTabs: [
      {
        domain: 'example.com',
        id: 'group-example',
        urlIds: ['url-example'],
      },
    ],
    urls: [
      {
        id: 'url-example',
        savedAt: now,
        title: 'Example Home',
        url: 'https://example.com/',
      },
      {
        id: 'url-orphan',
        savedAt: now - 1,
        title: 'Orphan URL',
        url: 'https://orphan.example/',
      },
    ],
    userSettings: { ...defaultUserSettings, clickBehavior: 'saveCurrentTab' },
  })

const createBlockedPreflightSeed = () =>
  createBaseSeed({
    savedTabs: [
      {
        domain: 'blocked.example',
        id: 'group-blocked',
        urlIds: ['duplicate-url'],
      },
    ],
    urls: [
      {
        id: 'duplicate-url',
        savedAt: now - 1,
        title: 'First duplicate',
        url: 'https://blocked.example/first',
      },
      {
        id: 'duplicate-url',
        savedAt: now,
        title: 'Second duplicate',
        url: 'https://blocked.example/second',
      },
    ],
  })

const createLegacyCategoryDriftSeed = () =>
  createBaseSeed({
    domainCategorySettings: [
      {
        categoryKeywords: [
          { categoryName: 'old-category', keywords: ['stale'] },
        ],
        domain: 'https://category-drift.example',
        subCategories: ['old-category'],
      },
    ],
    savedTabs: [
      {
        categoryKeywords: [
          { categoryName: 'docs', keywords: ['reference'] },
          { categoryName: 'news', keywords: [] },
        ],
        domain: 'category-drift.example',
        id: 'group-category-drift',
        savedAt: now,
        subCategories: ['docs', 'news'],
        subCategoryOrder: ['news'],
        subCategoryOrderWithUncategorized: ['__uncategorized', 'news'],
        urlIds: ['url-category-drift'],
      },
    ],
    urls: [
      {
        id: 'url-category-drift',
        savedAt: now,
        title: 'Category Drift Home',
        url: 'https://category-drift.example/',
      },
    ],
  })

const emptyPersistenceV2Seed = {
  categories: [],
  collections: [],
  groups: [],
  memberships: [],
  urls: [],
}

test.describe('extension options', () => {
  test('warning-onlyの旧storage移行後もタブ表示とreloadが成功する', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(
      serviceWorker,
      createBaseSeed({
        savedTabs: [
          {
            domain: 'example.com',
            id: 'group-example',
            urlIds: ['url-example'],
          },
        ],
        urls: [
          {
            id: 'url-example',
            savedAt: now,
            title: 'Example Home',
            url: 'https://example.com/',
          },
          {
            id: 'url-orphan',
            savedAt: now,
            title: 'Orphan',
            url: 'https://orphan.example/',
          },
        ],
      }),
    )

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)
    await expect(page.getByText('Example Home')).toBeVisible()

    await page.reload()
    await expect(page.getByText('Example Home')).toBeVisible()
  })

  test('旧runtimeのcategory driftを自動移行してIndexedDBから読める', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createLegacyCategoryDriftSeed())

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await waitForPersistenceV2Ready(serviceWorker)

    await expect(page.getByText('Category Drift Home')).toBeVisible()
    await expect(
      page.getByRole('alert').filter({ hasText: 'Storage recovery required' }),
    ).toBeHidden()
    const snapshot = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(snapshot.categories).toEqual([
      expect.objectContaining({ name: 'news', sortOrder: 0 }),
      expect.objectContaining({
        keywords: ['reference'],
        name: 'docs',
        sortOrder: 1024,
      }),
    ])
  })

  test('blocked preflightを安全な診断と再確認導線として表示する', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBlockedPreflightSeed())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))

    const recoveryAlert = page
      .getByRole('alert')
      .filter({ hasText: 'Storage recovery required' })
    await expect(recoveryAlert).toBeVisible()
    await expect(recoveryAlert).toContainText('Storage recovery required')
    await recoveryAlert.getByText('Safe migration diagnostics').click()
    await expect(recoveryAlert).toContainText('MIGRATION_SOURCE_BLOCKED')
    await expect(recoveryAlert).toContainText('DUPLICATE_URL_ID')

    await recoveryAlert
      .getByRole('button', { name: 'Run checks and retry' })
      .click()
    await expect(recoveryAlert).toBeVisible()
  })

  test('blocked preflight修復後もlive storage migrationを完了できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBlockedPreflightSeed())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    const recoveryAlert = page
      .getByRole('alert')
      .filter({ hasText: 'Storage recovery required' })
    await expect(recoveryAlert).toBeVisible()

    await serviceWorker.evaluate(
      async (urls) => {
        await chrome.storage.local.set({ urls })
      },
      [
        {
          id: 'duplicate-url',
          savedAt: now,
          title: 'Recovered storage URL',
          url: 'https://blocked.example/recovered',
        },
      ],
    )

    await recoveryAlert
      .getByRole('button', { name: 'Run checks and retry' })
      .click()
    await waitForPersistenceV2Ready(serviceWorker)
    await expect(recoveryAlert).toBeHidden()
    await expect
      .poll(async () => {
        const snapshot = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
        return snapshot.urls.some(
          ({ url }) => url === 'https://blocked.example/recovered',
        )
      })
      .toBe(true)
  })

  test('設定をBackup V2でエクスポートできる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    await waitForPersistenceV2Ready(serviceWorker)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const download = await downloadPromise
    const downloadPath = await download.path()
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
    await seedStorage(serviceWorker, createSeedWithUrls())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    await waitForPersistenceV2Ready(serviceWorker)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const download = await downloadPromise
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    const fileContent = await readFile(downloadPath as string, 'utf8')
    const backup = BackupEnvelopeV2Schema.parse(JSON.parse(fileContent))
    expect(backup.data.savedTabs.urls).toHaveLength(2)
    expect(backup.data.savedTabs.collections).toHaveLength(1)

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tabbin-import-v2-'))
    try {
      const tmpFilePath = path.join(tmpDir, 'tabbin-backup-v2.json')
      await writeFile(tmpFilePath, fileContent)
      await seedPersistenceV2SavedTabs(serviceWorker, emptyPersistenceV2Seed)

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
