import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { createExamplePersistenceFixture } from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  defaultUserSettings,
  readStorage,
  seedSavedTabsFixture,
} from './extension'

const now = Date.parse('2026-10-17T03:20:00Z')
const savedAt = now - 5 * 60_000

export const verifyRelativeSavedTime = async (
  page: Page,
  appUrl: string,
  screenshots: { options: string; savedTabs: string },
) => {
  await page.clock.setFixedTime(now)
  await page.goto(`${appUrl}#/options`)
  await seedSavedTabsFixture(page, {
    persistence: createExamplePersistenceFixture(savedAt),
    storage: createBaseSeed({
      userSettings: {
        ...defaultUserSettings,
        showRelativeSavedTime: false,
      },
    }),
  })
  await page.reload()
  const absoluteTime = await page.evaluate((timestamp) => {
    const date = new Date(timestamp)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }, savedAt)
  const parent = page.getByRole('checkbox', {
    name: 'Show saved time',
    exact: true,
  })
  const child = page.getByRole('checkbox', {
    name: 'Show relative saved time',
    exact: true,
  })

  const verifyCombination = async (
    showSavedTime: boolean,
    showRelativeSavedTime: boolean,
  ) => {
    await parent.setChecked(showSavedTime)
    if (showSavedTime) {
      await child.setChecked(showRelativeSavedTime)
    }
    await expect
      .poll(async () => {
        const stored = await readStorage<{
          userSettings: {
            showSavedTime: boolean
            showRelativeSavedTime: boolean
          }
        }>(page, 'userSettings')
        return {
          showSavedTime: stored.userSettings.showSavedTime,
          showRelativeSavedTime: stored.userSettings.showRelativeSavedTime,
        }
      })
      .toEqual({ showSavedTime, showRelativeSavedTime })
    await page.reload()
    await expect(parent).toBeChecked({ checked: showSavedTime })
    await expect(child).toBeChecked({ checked: showRelativeSavedTime })
    if (showSavedTime) {
      await expect(child).toBeEnabled()
    } else {
      await expect(child).toBeDisabled()
    }
    if (showSavedTime && showRelativeSavedTime) {
      await child.scrollIntoViewIfNeeded()
      await page.screenshot({ path: screenshots.options })
    }

    await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
    const row = page.getByRole('listitem').filter({
      has: page.getByRole('link', { name: /Example Home/u }),
    })
    await expect(row).toBeVisible()
    if (showSavedTime) {
      const display = row.getByText(
        showRelativeSavedTime ? '5 minutes ago' : absoluteTime,
        { exact: true },
      )
      await expect(display).toBeVisible()
      if (showRelativeSavedTime) {
        await expect(display).toHaveAttribute('title', absoluteTime)
      }
    } else {
      await expect(row.getByText(absoluteTime, { exact: true })).toBeHidden()
      await expect(row.getByText('5 minutes ago', { exact: true })).toBeHidden()
    }
    await page.goto(`${appUrl}#/options`)
  }

  // Each transition depends on the previous persisted UI state.
  await verifyCombination(false, false)
  await verifyCombination(true, false)
  await verifyCombination(true, true)
  await verifyCombination(false, true)

  // Re-enabling the parent restores the retained relative preference.
  await parent.setChecked(true)
  await expect(child).toBeChecked()
  await expect(child).toBeEnabled()
  const { userSettings } = await readStorage<{
    userSettings: Record<string, unknown>
  }>(page, 'userSettings')
  await page.evaluate(
    async (settings) =>
      new Promise<void>((resolve) => {
        chrome.storage.local.set(
          { userSettings: { ...settings, language: 'ja' } },
          resolve,
        )
      }),
    userSettings,
  )
  await page.reload()
  await expect(
    page.getByRole('checkbox', { name: '保存日時を相対表示する', exact: true }),
  ).toBeChecked()
  await page.goto(`${appUrl}#/saved-tabs?mode=domain`)
  const relativeTime = page.getByText('5 分前', { exact: true })
  await expect(relativeTime).toBeVisible()
  await page.screenshot({ path: screenshots.savedTabs })
  return absoluteTime
}
