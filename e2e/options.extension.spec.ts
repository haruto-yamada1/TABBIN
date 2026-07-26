import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  readStorage,
  seedStorage,
  test,
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

test.describe('extension options', () => {
  test('設定をエクスポートしてエクスポートデータの内容を確認できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const download = await downloadPromise

    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    const fileContent = await readFile(downloadPath as string, 'utf8')
    const backupData = JSON.parse(fileContent)

    expect(backupData.version).toBeDefined()
    expect(backupData.urls).toHaveLength(1)
    expect(backupData.urls[0].url).toBe('https://example.com/')
    expect(backupData.savedTabs).toHaveLength(1)
    expect(backupData.savedTabs[0].domain).toBe('example.com')
  })

  test('エクスポートしたファイルを実際のインポートUIで復元できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedStorage(serviceWorker, createSeedWithUrls())

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const download = await downloadPromise
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    const fileContent = await readFile(downloadPath as string, 'utf8')
    const backupData = JSON.parse(fileContent)
    expect(backupData.urls).toHaveLength(1)
    expect(backupData.savedTabs).toHaveLength(1)

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tabbin-import-'))
    const tmpFilePath = path.join(tmpDir, 'tabbin-backup.json')
    await writeFile(tmpFilePath, fileContent)

    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.clear()
    })

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

    const data = await readStorage<{
      savedTabs: { domain: string }[]
      urls: { url: string }[]
    }>(serviceWorker, ['savedTabs', 'urls'])
    expect(data.savedTabs[0].domain).toBe('example.com')
    expect(data.urls[0].url).toBe('https://example.com/')

    await rm(tmpDir, { force: true, recursive: true })
  })
})
