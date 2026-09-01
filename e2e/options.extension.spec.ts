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

const requireValue = <Value>(
  value: Value | null | undefined,
  message: string,
): Value => {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

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
  const orphanLegacyUrl = {
    id: 'url-legacy-orphan',
    savedAt: now - 1,
    title: 'Legacy Orphan',
    url: 'https://orphan.legacy.example/',
  }

  return {
    customProjectOrder: ['project-legacy'],
    customProjects: [
      {
        categories: [],
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
    urls: [legacyUrl, orphanLegacyUrl],
    userSettings: {
      ...defaultUserSettings,
      activeAiSystemPrompt,
      activeAiSystemPromptId: activeAiSystemPrompt.id,
      aiChatEnabled: false,
      aiProvider: 'none',
      aiSystemPrompts: [activeAiSystemPrompt],
      autoDeletePeriod: 'never',
      clickBehavior: 'saveCurrentTab',
      openUrlInBackground: false,
      removeTabAfterOpen: true,
    },
    version: '1.2.4',
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

  test('blocked preflight修復後に旧形式importをIndexedDBへ保存できる', async ({
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
          title: 'Recovered legacy URL',
          url: 'https://blocked.example/recovered',
        },
      ],
    )
    const tmpDir = await mkdtemp(
      path.join(os.tmpdir(), 'tabbin-import-after-recovery-'),
    )
    try {
      const tmpFilePath = path.join(tmpDir, 'tabbin-backup-legacy.json')
      await writeFile(tmpFilePath, JSON.stringify(createLegacyBackup()))

      await page.getByRole('button', { name: /import/i }).click()
      await page
        .locator('[data-testid="hidden-file-input"]')
        .setInputFiles(tmpFilePath)
      await page.getByRole('button', { name: /confirm.*import/i }).click()
      await expect(
        page.getByRole('button', { name: /confirm.*import/i }),
      ).toBeHidden()

      await waitForPersistenceV2Ready(serviceWorker)
      await expect(recoveryAlert).toBeHidden()
      await expect
        .poll(async () => {
          const snapshot =
            await readPersistenceV2SavedTabsSnapshot(serviceWorker)
          return snapshot.urls.some(
            ({ url }) => url === 'https://legacy.example/',
          )
        })
        .toBe(true)
    } finally {
      await rm(tmpDir, { force: true, recursive: true })
    }
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

  test('旧形式を import して URL を開き、再保存後に reload できる', async ({
    extensionContext,
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
      const legacyUrlButton = page.getByRole('button', {
        exact: true,
        name: 'Legacy Home',
      })
      await expect(legacyUrlButton).toBeVisible()
      await expect
        .poll(async () => {
          const snapshot =
            await readPersistenceV2SavedTabsSnapshot(serviceWorker)
          return {
            memberships: snapshot.memberships.length,
            revision: snapshot.revision,
            urls: snapshot.urls.length,
          }
        })
        .toEqual({ memberships: 2, revision: 1, urls: 2 })

      const openedPagePromise = extensionContext.waitForEvent('page')
      await legacyUrlButton.click()
      const openedPage = await openedPagePromise
      await expect
        .poll(async () => {
          const snapshot =
            await readPersistenceV2SavedTabsSnapshot(serviceWorker)
          return {
            memberships: snapshot.memberships.length,
            revision: snapshot.revision,
            urls: snapshot.urls.length,
          }
        })
        .toEqual({ memberships: 0, revision: 2, urls: 1 })

      await openedPage.bringToFront()
      const openedPageClosed = openedPage.waitForEvent('close')
      const browser = requireValue(
        extensionContext.browser(),
        'Extension browser is unavailable.',
      )
      const browserCdp = await browser.newBrowserCDPSession()
      try {
        const { targetInfos } = await browserCdp.send('Target.getTargets', {
          filter: [{ type: 'tab' }],
        })
        const target = requireValue(
          targetInfos.find(
            ({ type, url }) =>
              type === 'tab' && url === 'https://legacy.example/',
          ),
          'Opened legacy URL tab target was not found.',
        )
        await browserCdp.send('Extensions.triggerAction', {
          id: extensionId,
          targetId: target.targetId,
        })
      } finally {
        await browserCdp.detach()
      }
      await openedPageClosed

      await expect
        .poll(async () => {
          const snapshot =
            await readPersistenceV2SavedTabsSnapshot(serviceWorker)
          return {
            memberships: snapshot.memberships.length,
            revision: snapshot.revision,
            urls: snapshot.urls.length,
          }
        })
        .toEqual({ memberships: 2, revision: 3, urls: 2 })
      const savedSnapshot =
        await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      const resavedUrl = requireValue(
        savedSnapshot.urls.find(
          (record) =>
            (record as { normalizedUrl?: unknown }).normalizedUrl ===
            'https://legacy.example/',
        ) as { normalizedUrl: string; title: string } | undefined,
        'Resaved legacy URL was not found.',
      )
      expect(resavedUrl).toEqual(
        expect.objectContaining({ normalizedUrl: 'https://legacy.example/' }),
      )
      expect(resavedUrl.title).toEqual(expect.any(String))
      expect(resavedUrl.title.length).toBeGreaterThan(0)

      await page.reload()
      await expect(
        page.getByRole('button', {
          exact: true,
          name: resavedUrl.title,
        }),
      ).toBeVisible()
      const reloaded = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
      expect(reloaded).toEqual(
        expect.objectContaining({
          memberships: expect.arrayContaining([
            expect.objectContaining({ urlId: expect.any(String) }),
          ]),
          revision: 3,
          urls: expect.arrayContaining([
            expect.objectContaining({
              normalizedUrl: 'https://legacy.example/',
            }),
          ]),
        }),
      )

      await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: /export/i }).click()
      const download = await downloadPromise
      const downloadPath = await download.path()
      expect(downloadPath).toBeTruthy()
      const exported = BackupEnvelopeV2Schema.parse(
        JSON.parse(await readFile(downloadPath as string, 'utf8')),
      )
      expect(exported.schemaVersion).toBe(2)
      expect(exported.data.userSettings).not.toHaveProperty('aiChatEnabled')
      expect(exported.data.userSettings).not.toHaveProperty('aiProvider')
      expect(exported.data.savedTabs.urls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: 'https://legacy.example/' }),
        ]),
      )
    } finally {
      await rm(tmpDir, { force: true, recursive: true })
    }
  })
})
