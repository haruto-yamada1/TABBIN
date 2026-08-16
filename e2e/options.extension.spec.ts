import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
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
    ],
    userSettings: { ...defaultUserSettings, clickBehavior: 'saveCurrentTab' },
  })

const createLegacyBackup = () => {
  const activeAiSystemPrompt = {
    createdAt: now - 1,
    id: 'legacy-active-prompt',
    name: 'Legacy active prompt',
    template: 'Legacy prompt template',
    updatedAt: now,
  }
  const legacyUrl = {
    id: 'url-legacy',
    savedAt: now,
    title: 'Legacy Home',
    url: 'https://legacy.example/',
  }

  return {
    customProjectOrder: ['project-legacy'],
    customProjects: [
      {
        categories: ['Reference'],
        categoryOrder: ['Reference'],
        createdAt: now - 1,
        id: 'project-legacy',
        name: 'Legacy Project',
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        updatedAt: now,
        urls: [
          {
            category: 'Reference',
            notes: 'Legacy memo',
            savedAt: legacyUrl.savedAt,
            title: legacyUrl.title,
            url: legacyUrl.url,
          },
        ],
      },
    ],
    parentCategories: [],
    savedTabs: [
      {
        categoryKeywords: [
          { categoryName: 'news', keywords: [] },
          { categoryName: 'docs', keywords: [] },
        ],
        domain: 'legacy.example',
        id: 'group-legacy',
        savedAt: now,
        subCategories: ['news', 'docs'],
        subCategoryOrder: ['news'],
        subCategoryOrderWithUncategorized: ['__uncategorized', 'news'],
        urlIds: [legacyUrl.id],
        urls: [
          {
            savedAt: legacyUrl.savedAt,
            subCategory: 'news',
            title: legacyUrl.title,
            url: legacyUrl.url,
          },
        ],
        urlSubCategories: { [legacyUrl.id]: 'news' },
      },
    ],
    timestamp: new Date(now).toISOString(),
    urls: [legacyUrl],
    userSettings: {
      activeAiSystemPrompt,
      activeAiSystemPromptId: activeAiSystemPrompt.id,
      aiSystemPrompts: [activeAiSystemPrompt],
    },
    version: '2.0.9',
  }
}

const emptyPersistenceV2Seed = {
  categories: [],
  collections: [],
  groups: [],
  memberships: [],
  urls: [],
}

test.describe('extension options', () => {
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
    expect(backup.data.savedTabs.urls).toHaveLength(1)
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
    expect(backup.data.savedTabs.urls).toHaveLength(1)
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
    } finally {
      await rm(tmpDir, { force: true, recursive: true })
    }
  })

  test('旧形式のバックアップを実際のインポートUIで取り込める', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createBaseSeed())
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    await waitForPersistenceV2Ready(serviceWorker)

    const tmpDir = await mkdtemp(
      path.join(os.tmpdir(), 'tabbin-import-legacy-'),
    )
    try {
      const tmpFilePath = path.join(tmpDir, 'tabbin-backup-legacy.json')
      await writeFile(tmpFilePath, JSON.stringify(createLegacyBackup()))

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
      await expect(page.getByText('Legacy Home')).toBeVisible()
    } finally {
      await rm(tmpDir, { force: true, recursive: true })
    }
  })
})
