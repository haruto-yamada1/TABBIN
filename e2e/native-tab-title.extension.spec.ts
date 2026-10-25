import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  readPersistenceV2Store,
  seedSavedTabsFixture,
  triggerToolbarAction,
} from './helpers/extension'
import {
  createNativeTitleSeed,
  expectNativeTitle,
  nativeTitleUrls,
  test,
  readInjectedNativeTitle,
  routeNativeTitlePages,
} from './helpers/native-tab-title'

test('production optional permissions prevent title injection even with a stored opt-in', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await routeNativeTitlePages(extensionContext)
  await seedSavedTabsFixture(serviceWorker, createNativeTitleSeed())
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  const setting = page.locator('#saved-tab-title-indicator')
  await expect(setting).not.toBeChecked()
  expect(
    await page.evaluate(async () =>
      chrome.permissions.contains({
        permissions: ['scripting'],
        origins: ['http://*/*', 'https://*/*'],
      }),
    ),
  ).toBe(false)
  await serviceWorker.evaluate(async () =>
    chrome.storage.local.set({ savedTabTitleIndicatorEnabled: true }),
  )
  const article = await extensionContext.newPage()
  await article.goto(nativeTitleUrls.article)
  await expectNativeTitle(article, serviceWorker, 'Article')
  expect(
    await readInjectedNativeTitle(serviceWorker, nativeTitleUrls.article),
  ).toBeNull()
  await expect(setting).not.toBeChecked()
})

test.describe('pregranted optional native title access', () => {
  test.use({ pregrantNativeTitle: true })

  test('native tab titles follow exact saved membership, site changes and opt-out', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await routeNativeTitlePages(extensionContext)
    await seedSavedTabsFixture(serviceWorker, createNativeTitleSeed())
    const appUrl = getExtensionUrl(extensionId, 'app.html')
    await page.goto(`${appUrl}#/options`)
    const setting = page.locator('#saved-tab-title-indicator')
    await expect(setting).not.toBeChecked()
    expect(
      await page.evaluate(async () =>
        chrome.permissions.contains({
          permissions: ['scripting'],
          origins: ['http://*/*', 'https://*/*'],
        }),
      ),
    ).toBe(true)
    const manifest = await page.evaluate(() => chrome.runtime.getManifest())
    expect(manifest.permissions).not.toContain('scripting')
    expect(manifest.optional_permissions).toEqual(['scripting'])
    expect(manifest.optional_host_permissions).toEqual([
      'http://*/*',
      'https://*/*',
    ])
    const article = await extensionContext.newPage()
    const checkmark = await extensionContext.newPage()
    const unsaved = await extensionContext.newPage()
    const hash = await extensionContext.newPage()
    await article.goto(nativeTitleUrls.article)
    await checkmark.goto(nativeTitleUrls.checkmark)
    await unsaved.goto(nativeTitleUrls.unsaved)
    await hash.goto(`${nativeTitleUrls.article}#not-saved`)
    await expectNativeTitle(article, serviceWorker, 'Article')
    await expectNativeTitle(checkmark, serviceWorker, '✓ Site title')

    await setting.click()
    await expect(setting).toBeChecked()
    await expectNativeTitle(article, serviceWorker, '✓ Article')
    await expectNativeTitle(checkmark, serviceWorker, '✓ ✓ Site title')
    await expectNativeTitle(unsaved, serviceWorker, 'Unsaved article')
    await expectNativeTitle(hash, serviceWorker, 'Article')
    expect(
      await readInjectedNativeTitle(serviceWorker, nativeTitleUrls.checkmark),
    ).toEqual({
      baseTitle: '✓ Site title',
      displayTitle: '✓ ✓ Site title',
      url: nativeTitleUrls.checkmark,
    })

    const section = page.locator('section').filter({ has: setting })
    await section.screenshot({
      path: '/tmp/tabbin-native-title-options-en.png',
    })
    await testInfo.attach('native-title-options-en', {
      path: '/tmp/tabbin-native-title-options-en.png',
      contentType: 'image/png',
    })
    await page.evaluate(async () => {
      const { userSettings } = await chrome.storage.local.get('userSettings')
      await chrome.storage.local.set({
        userSettings: { ...userSettings, language: 'ja' },
      })
    })
    await expect(section).toContainText('ブラウザタブの保存済みマーク')
    await section.screenshot({
      path: '/tmp/tabbin-native-title-options-ja.png',
    })
    await testInfo.attach('native-title-options-ja', {
      path: '/tmp/tabbin-native-title-options-ja.png',
      contentType: 'image/png',
    })
    await page.evaluate(async () => {
      const { userSettings } = await chrome.storage.local.get('userSettings')
      await chrome.storage.local.set({
        userSettings: { ...userSettings, language: 'en' },
      })
    })

    await article.evaluate(() => history.pushState({}, '', '#not-saved'))
    await expectNativeTitle(article, serviceWorker, 'Article')
    await article.evaluate(() => history.replaceState({}, '', '/article'))
    await expectNativeTitle(article, serviceWorker, '✓ Article')
    await article.evaluate(() => {
      document.title = 'Live site update'
    })
    await expectNativeTitle(article, serviceWorker, '✓ Live site update')
    await article.goto(nativeTitleUrls.unsaved)
    await expectNativeTitle(article, serviceWorker, 'Unsaved article')
    await article.goto(nativeTitleUrls.article)
    await expectNativeTitle(article, serviceWorker, '✓ Article')

    await page.goto(`${appUrl}#/saved-tabs?mode=custom`)
    const customRow = page
      .getByTestId('project-url-item')
      .filter({ has: page.getByRole('link', { name: 'Article', exact: true }) })
    await customRow.hover()
    await customRow
      .getByRole('button', { name: 'Delete tab', exact: true })
      .click()
    await expect(customRow).toBeHidden()
    await expectNativeTitle(article, serviceWorker, '✓ Article')
    await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
    const domainRow = page
      .getByTestId('sortable-url-item')
      .filter({ has: page.getByRole('link', { name: 'Article', exact: true }) })
    await domainRow.hover()
    await domainRow
      .getByRole('button', { name: 'Delete tab', exact: true })
      .click()
    await expect(domainRow).toBeHidden()
    await expectNativeTitle(article, serviceWorker, 'Article')
    await expect
      .poll(async () =>
        (
          await readPersistenceV2Store<{ id: string }>(serviceWorker, 'urls')
        ).some(({ id }) => id === 'native-article'),
      )
      .toBe(false)
    await expectNativeTitle(checkmark, serviceWorker, '✓ ✓ Site title')

    await page.goto(`${appUrl}#/options`)
    await setting.click()
    await expect(setting).not.toBeChecked()
    await expectNativeTitle(checkmark, serviceWorker, '✓ Site title')
    expect(
      await readInjectedNativeTitle(serviceWorker, nativeTitleUrls.checkmark),
    ).toBeNull()
    await setting.click()
    await expect(setting).toBeChecked()
    await expectNativeTitle(checkmark, serviceWorker, '✓ ✓ Site title')

    await checkmark.evaluate(() => {
      document.title = '✓ Resaved site title'
    })
    await expectNativeTitle(checkmark, serviceWorker, '✓ ✓ Resaved site title')
    await checkmark.bringToFront()
    const closed = checkmark.waitForEvent('close')
    await triggerToolbarAction(extensionContext, checkmark, extensionId)
    await closed
    await expect
      .poll(
        async () =>
          (await readPersistenceV2SavedTabsSnapshot(serviceWorker)).urls.find(
            (url) => url.url === nativeTitleUrls.checkmark,
          )?.title,
      )
      .toBe('✓ Resaved site title')
    await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
    await expect(
      page.getByRole('link', { name: '✓ Resaved site title', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: '✓ ✓ Resaved site title', exact: true }),
    ).toBeHidden()

    const revoked = await extensionContext.newPage()
    await revoked.goto(nativeTitleUrls.checkmark)
    await expectNativeTitle(revoked, serviceWorker, '✓ ✓ Site title')
    await page.goto(`${appUrl}#/options`)
    await expect(setting).toBeChecked()
    expect(
      await page.evaluate(async () =>
        chrome.permissions.remove({
          permissions: ['scripting'],
          origins: ['http://*/*', 'https://*/*'],
        }),
      ),
    ).toBe(true)
    expect(
      await page.evaluate(async () =>
        chrome.permissions.contains({
          permissions: ['scripting'],
          origins: ['http://*/*', 'https://*/*'],
        }),
      ),
    ).toBe(false)
    await expectNativeTitle(revoked, serviceWorker, '✓ Site title')
    await expect(setting).not.toBeChecked()
    expect(
      await readInjectedNativeTitle(serviceWorker, nativeTitleUrls.checkmark),
    ).toBeNull()
  })
})

test.describe('native title persistence lifecycle', () => {
  test.use({ pregrantNativeTitle: true })

  test('Undo and Backup import refresh titles after a real MV3 worker stop', async ({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  }) => {
    await routeNativeTitlePages(extensionContext)
    await seedSavedTabsFixture(serviceWorker, createNativeTitleSeed())
    const appUrl = getExtensionUrl(extensionId, 'app.html')
    await page.goto(`${appUrl}#/options`)
    await page.locator('#saved-tab-title-indicator').click()
    const article = await extensionContext.newPage()
    const checkmark = await extensionContext.newPage()
    await article.goto(nativeTitleUrls.article)
    await checkmark.goto(nativeTitleUrls.checkmark)
    await expectNativeTitle(article, serviceWorker, '✓ Article')
    await page.goto(`${appUrl}#/saved-tabs?mode=custom`)
    const custom = page
      .getByTestId('project-url-item')
      .filter({ has: page.getByRole('link', { name: 'Article', exact: true }) })
    await custom.hover()
    await custom
      .getByRole('button', { name: 'Delete tab', exact: true })
      .click()
    await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
    const domain = page
      .getByTestId('sortable-url-item')
      .filter({ has: page.getByRole('link', { name: 'Article', exact: true }) })
    await domain.hover()
    await domain
      .getByRole('button', { name: 'Delete tab', exact: true })
      .click()
    await expectNativeTitle(article, serviceWorker, 'Article')
    await page
      .locator('[data-sonner-toast][data-front="true"]')
      .getByRole('button', { name: 'Undo', exact: true })
      .click()
    await expectNativeTitle(article, serviceWorker, '✓ Article')

    await page.goto(`${appUrl}#/options`)
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: /export/i }).click()
    const backupPath = await (await downloading).path()
    assert.ok(backupPath, 'Backup download missing')
    const content = await readFile(backupPath, 'utf8')
    expect(content).not.toContain('savedTabTitleIndicatorEnabled')
    expect(content).not.toContain('✓ Article')
    await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
    await domain.hover()
    await domain
      .getByRole('button', { name: 'Delete tab', exact: true })
      .click()
    await expectNativeTitle(article, serviceWorker, 'Article')
    await page.goto(`${appUrl}#/options`)
    await page.getByRole('button', { name: /import/i }).click()
    await page.getByTestId('hidden-file-input').setInputFiles({
      name: 'native-title-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    })
    const dialog = page.getByRole('dialog')
    const confirm = dialog.getByRole('button', { name: 'Confirm Import' })
    await expect(confirm).toBeEnabled()
    const cdp = await extensionContext.newCDPSession(page)
    let versionId: string | undefined
    let workerStatus: string | undefined
    cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
      const version = versions.find(
        ({ scriptURL }) => scriptURL === serviceWorker.url(),
      )
      if (version) {
        versionId = version.versionId
        workerStatus = version.runningStatus
      }
    })
    await cdp.send('ServiceWorker.enable')
    await expect.poll(() => versionId).toBeDefined()
    assert.ok(versionId, 'Worker version missing')
    await cdp.send('ServiceWorker.stopWorker', { versionId })
    await expect.poll(() => workerStatus).toBe('stopped')
    await confirm.click()
    await expect(dialog).toBeHidden()
    // The app's post-commit relay wakes the stopped worker and re-reads IndexedDB.
    await expect(article).toHaveTitle('✓ Article')
    await expect(checkmark).toHaveTitle('✓ ✓ Site title')
    await expect.poll(() => workerStatus).toBe('running')
    expect(
      await page.evaluate(
        async () =>
          (await chrome.storage.local.get('savedTabTitleIndicatorEnabled'))
            .savedTabTitleIndicatorEnabled,
      ),
    ).toBe(true)
    await cdp.detach()
  })
})
