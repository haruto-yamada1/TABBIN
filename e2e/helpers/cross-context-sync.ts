import { readFile } from 'node:fs/promises'

import { expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

import { BackupEnvelopeV2Schema } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import {
  createCustomCollectionFixture,
  createExamplePersistenceFixture,
  createMembershipFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import { exportFullBackup } from './backup-export'
import {
  createBaseSeed,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
} from './extension'

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- test-only Window augmentation
  interface Window {
    __syncEvents: unknown[]
    __syncNotifications: {
      queued: () => number
      relevantRevisions: () => readonly number[]
      deliverReversedTwice: () => void
    }
  }
}

// Keep native transport and committed data; disturb delivery only in this page.
export const holdPersistenceNotifications = async (page: Page) => {
  await page.addInitScript(() => {
    const NativeChannel = BroadcastChannel
    const pending: (() => void)[] = []
    const relevantRevisions: number[] = []
    let holding = true
    Object.assign(globalThis, {
      BroadcastChannel: class extends NativeChannel {
        override addEventListener(
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: AddEventListenerOptions | boolean,
        ) {
          super.addEventListener(
            type,
            (event) => {
              const deliver = () => {
                if (typeof listener === 'function') {
                  listener.call(this, event)
                } else {
                  listener?.handleEvent(event)
                }
              }
              if (holding && this.name === 'tabbin:persistence-change:v1') {
                const data: unknown =
                  event instanceof MessageEvent ? event.data : undefined
                if (
                  typeof data === 'object' &&
                  data !== null &&
                  'revision' in data &&
                  typeof data.revision === 'number' &&
                  'scopes' in data &&
                  Array.isArray(data.scopes) &&
                  data.scopes.includes('urls')
                ) {
                  relevantRevisions.push(data.revision)
                }
                pending.push(deliver)
              } else {
                deliver()
              }
            },
            options,
          )
        }
      },
    })
    window.__syncNotifications = {
      deliverReversedTwice: () => {
        holding = false
        for (const deliver of pending.splice(0).toReversed()) {
          deliver()
          deliver()
        }
      },
      queued: () => pending.length,
      relevantRevisions: () => [...relevantRevisions],
    }
  })
}

export const verifyMissedNotificationRecovery = async (
  context: BrowserContext,
  options: Page,
  appUrl: string,
) => {
  await seedSavedTabsFixture(options, {
    persistence: createExamplePersistenceFixture(1),
    storage: createBaseSeed(),
  })
  const domain = await context.newPage()
  await holdPersistenceNotifications(domain)
  await domain.goto(`${appUrl}#/saved-tabs?mode=domain`)
  await expect(domain.getByText('Example Home', { exact: true })).toBeVisible()
  expect(
    await options.evaluate(async () => {
      const response: unknown = await chrome.runtime.sendMessage({
        action: 'removeUrlFromStorage',
        url: 'https://example.com/',
      })
      return response
    }),
  ).toEqual({ status: 'removed' })
  await expect
    .poll(async () =>
      domain.evaluate(() => window.__syncNotifications.queued()),
    )
    .toBeGreaterThan(0)
  // The page has missed the event; focus must repair it from IndexedDB.
  await expect(domain.getByText('Example Home', { exact: true })).toBeVisible()
  await domain.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(domain.getByText('Example Home', { exact: true })).toBeHidden()
  // A stale duplicate arriving after repair cannot resurrect the removed URL.
  await domain.evaluate(() => {
    window.__syncNotifications.deliverReversedTwice()
  })
  await expect(domain.getByText('Example Home', { exact: true })).toBeHidden()
  return domain
}

// Run the same real extension UI contract on Chrome and Firefox.
export const verifyCrossContextSync = async (
  context: BrowserContext,
  options: Page,
  appUrl: string,
  delivery: 'normal' | 'reversed' = 'normal',
) => {
  const fixture = createExamplePersistenceFixture(1)
  await seedSavedTabsFixture(options, {
    persistence: {
      ...fixture,
      collections: [
        ...fixture.collections.map((collection) => ({
          ...collection,
          groupId: 'shared-parent',
        })),
        createCustomCollectionFixture('shared-project', 'Shared project', 1),
      ],
      groups: [
        {
          id: 'shared-parent',
          name: 'Before category',
          createdAt: 1,
          updatedAt: 1,
          sortOrder: 0,
        },
      ],
      memberships: [
        ...fixture.memberships,
        createMembershipFixture('shared-project', 'url-example', 1),
      ],
    },
    storage: createBaseSeed(),
  })
  await options.goto(`${appUrl}#/options`)
  await options.evaluate(() => {
    window.__syncEvents = []
    const channel = new BroadcastChannel('tabbin:persistence-change:v1')
    channel.addEventListener('message', (event) =>
      window.__syncEvents.push(event.data),
    )
  })
  const domain = await context.newPage()
  const custom = await context.newPage()
  if (delivery === 'reversed') {
    await holdPersistenceNotifications(domain)
    await holdPersistenceNotifications(custom)
  }
  await domain.goto(`${appUrl}#/saved-tabs?mode=domain`)
  await custom.goto(`${appUrl}#/saved-tabs?mode=custom`)
  await expect(domain.getByText('Example Home', { exact: true })).toBeVisible()
  await expect(custom.getByText('Example Home', { exact: true })).toBeVisible()

  const download = options.waitForEvent('download')
  await exportFullBackup(options)
  const backup = BackupEnvelopeV2Schema.parse(
    JSON.parse(await readFile(await (await download).path(), 'utf8')),
  )
  const importedBackup = {
    ...backup,
    data: {
      ...backup.data,
      savedTabs: {
        ...backup.data.savedTabs,
        urls: backup.data.savedTabs.urls.map((url) => ({
          ...url,
          title: 'Imported Home',
        })),
        groups: backup.data.savedTabs.groups.map((group) => ({
          ...group,
          name: 'After category',
        })),
        collections: backup.data.savedTabs.collections.map((collection) =>
          collection.definition.type === 'custom'
            ? { ...collection, name: 'Imported project' }
            : collection,
        ),
      },
    },
  }

  expect(
    await options.evaluate(async () => {
      const response: unknown = await chrome.runtime.sendMessage({
        action: 'removeUrlFromStorage',
        url: 'https://example.com/',
      })
      return response
    }),
  ).toEqual({ status: 'removed' })
  const deleted = await readPersistenceV2SavedTabsSnapshot(options)
  if (delivery === 'normal') {
    await expect(domain.getByText('Example Home', { exact: true })).toBeHidden()
    await expect(custom.getByText('Example Home', { exact: true })).toBeHidden()
  }

  await options.getByRole('button', { name: /import/i }).click()
  await options.getByTestId('hidden-file-input').setInputFiles({
    buffer: Buffer.from(JSON.stringify(importedBackup)),
    mimeType: 'application/json',
    name: 'cross-context-backup.json',
  })
  await options.getByRole('button', { name: /confirm.*import/i }).click()
  await expect(
    options.getByRole('button', { name: /confirm.*import/i }),
  ).toBeHidden()
  await expect
    .poll(async () => {
      const urls: unknown = (await readPersistenceV2SavedTabsSnapshot(options))
        .urls
      return urls
    })
    .toMatchObject([{ title: 'Imported Home' }])
  const committed = await readPersistenceV2SavedTabsSnapshot(options)
  if (delivery === 'reversed') {
    await Promise.all(
      [domain, custom].map(async (consumer) => {
        await expect
          .poll(async () =>
            consumer.evaluate(() =>
              window.__syncNotifications.relevantRevisions(),
            ),
          )
          .toEqual(
            expect.arrayContaining([deleted.revision, committed.revision]),
          )
        await consumer.evaluate(() => {
          window.__syncNotifications.deliverReversedTwice()
        })
      }),
    )
  }
  await expect(domain.getByText('Imported Home', { exact: true })).toBeVisible()
  await expect(custom.getByText('Imported Home', { exact: true })).toBeVisible()
  await expect(
    domain.getByText('After category', { exact: true }),
  ).toBeVisible()
  await expect(
    custom.getByText('Imported project', { exact: true }),
  ).toBeVisible()
  expect(await readPersistenceV2SavedTabsSnapshot(options)).toEqual(committed)
  const events = await options.evaluate(() => window.__syncEvents)
  expect(events.length).toBeGreaterThan(0)
  for (const event of events) {
    expect(event).toEqual({
      changeId: expect.any(String),
      revision: expect.any(Number),
      scopes: expect.any(Array),
    })
  }
  expect(JSON.stringify(events)).not.toContain('example.com')
  expect(JSON.stringify(events)).not.toContain('Imported Home')
  return { domain, custom }
}
