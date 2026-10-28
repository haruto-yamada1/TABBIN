import assert from 'node:assert/strict'

import { expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'

import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
} from './extension'

const title = 'A long saved title with enough detail to overflow a narrow card'
const rawUrl = `https://example.com/資料/${'long-path-segment/'.repeat(12)}?query=日本語&filter=a%2Fb#section-詳細`

const mockClipboard = async (page: Page, rejectWrite = false) => {
  await page.evaluate((shouldReject) => {
    const copies: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        copies,
        writeText: async (value: string) => {
          await Promise.resolve()
          if (shouldReject) {
            throw new Error('Clipboard access denied')
          }
          copies.push(value)
        },
      },
    })
  }, rejectWrite)
}

export const verifySavedUrlDetails = async (
  page: Page,
  appUrl: string,
  testInfo: TestInfo,
) => {
  const now = Date.now()
  await page.goto(`${appUrl}#/options`)
  await seedSavedTabsFixture(page, {
    storage: createBaseSeed(),
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture('details-domain', 'example.com', now),
        createCustomCollectionFixture('details-project', 'Reading queue', now),
      ],
      groups: [],
      memberships: ['details-domain', 'details-project'].map((collectionId) =>
        createMembershipFixture(collectionId, 'details-url', now),
      ),
      urls: [createUrlFixture('details-url', rawUrl, title, now)],
    },
  })
  const before = await readPersistenceV2SavedTabsSnapshot(page)

  // Each view reads the same saved URL without opening or mutating it.
  const verifyMode = async (mode: 'domain' | 'custom') => {
    await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
    await page.setViewportSize({ width: 390, height: 760 })
    const link = page.getByRole('link', { name: title, exact: true })
    const trigger = page.getByRole('button', {
      name: `View URL: ${title}`,
      exact: true,
    })
    await expect(link).toHaveAttribute('href', new URL(rawUrl).href)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(trigger).toBeVisible()
    await page.getByRole('listitem').filter({ has: link }).hover()
    const deleteButton = page.getByRole('button', {
      name: 'Delete tab',
      exact: true,
    })
    await expect(deleteButton).toBeVisible()
    const [detailsBounds, deleteBounds] = await Promise.all([
      trigger.boundingBox(),
      deleteButton.boundingBox(),
    ])
    assert.ok(detailsBounds)
    assert.ok(deleteBounds)
    expect(detailsBounds.x + detailsBounds.width).toBeLessThanOrEqual(
      deleteBounds.x,
    )
    await trigger.focus()
    await trigger.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Full URL', exact: true })
    const textbox = dialog.getByRole('textbox', {
      name: 'Full URL',
      exact: true,
    })
    await expect(dialog).toBeVisible()
    await expect(textbox).toHaveValue(rawUrl)
    await expect(textbox).toHaveAttribute('readonly', '')
    await mockClipboard(page)
    await dialog.getByRole('button', { name: 'Copy URL', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('URL copied')
    expect(
      await page.evaluate((): unknown =>
        Reflect.get(navigator.clipboard, 'copies'),
      ),
    ).toEqual([rawUrl])
    const screenshotPath = testInfo.outputPath(`${mode}-full-url-narrow.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await testInfo.attach(`${mode}-full-url-narrow`, {
      path: screenshotPath,
      contentType: 'image/png',
    })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()

    // The visible trigger also works with a pointer at a touch-sized viewport.
    await trigger.click()
    await expect(textbox).toHaveValue(rawUrl)
    await mockClipboard(page, true)
    await dialog.getByRole('button', { name: 'Copy URL', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText(
      'Could not copy. Select the URL and copy it manually.',
    )
    await expect(textbox).toBeVisible()
    await textbox.focus()
    await textbox.press('ControlOrMeta+A')
    expect(
      await textbox.evaluate((element: HTMLTextAreaElement) =>
        element.value.slice(element.selectionStart, element.selectionEnd),
      ),
    ).toBe(rawUrl)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(link).toHaveAttribute('href', new URL(rawUrl).href)
    expect(await readPersistenceV2SavedTabsSnapshot(page)).toEqual(before)
  }
  await verifyMode('domain')
  await verifyMode('custom')
}
