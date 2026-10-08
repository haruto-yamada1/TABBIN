import { z } from 'zod'

import {
  defaultReviewReminderSettings,
  ReviewReminderSettingsSchema,
} from '@/features/review-reminders/lib/reviewReminderSettings'
import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  readStorage,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

const NotificationStorageSchema = z.object({
  reviewReminderNotification: z
    .object({
      settings: ReviewReminderSettingsSchema,
      reviewAt: z.number().int().positive(),
    })
    .optional(),
})

test('review schedule persists, real alarms deliver matching candidates, and disabling preserves saved tabs', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  const now = Date.now()
  const old = now - 100 * 86_400_000
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed(),
    persistence: {
      groups: [],
      categories: [],
      collections: [
        createDomainCollectionFixture('review-domain', 'example.com', old),
        createCustomCollectionFixture('review-project', 'Reading', old, 1024),
      ],
      urls: [
        createUrlFixture(
          'review-old',
          'https://example.com/old',
          'Old saved URL',
          old,
        ),
        createUrlFixture(
          'review-new',
          'https://example.com/new',
          'New saved URL',
          now,
        ),
        {
          ...createUrlFixture(
            'review-unknown',
            'https://example.com/unknown',
            'Unknown saved date',
            old,
          ),
          firstSavedAtProvenance: 'legacy-fallback',
        },
      ],
      memberships: [
        createMembershipFixture('review-domain', 'review-old', old),
        createMembershipFixture('review-project', 'review-old', old),
        createMembershipFixture('review-domain', 'review-new', now, 1024),
        createMembershipFixture('review-project', 'review-unknown', old, 1024),
      ],
    },
  })
  const original = await readPersistenceV2SavedTabsSnapshot(serviceWorker)
  await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
  const settings = page.getByRole('region', {
    name: 'Review reminders',
    exact: true,
  })
  await expect(settings.getByLabel('Enable review reminders')).not.toBeChecked()
  await settings.getByLabel('Enable review reminders').check()
  await settings
    .getByLabel('Tabs to review', { exact: true })
    .selectOption('older')
  await settings.getByLabel('Frequency', { exact: true }).selectOption('daily')
  await settings.getByLabel('Pause notifications during quiet hours').uncheck()
  await settings
    .getByRole('button', { name: 'Save reminder settings', exact: true })
    .click()
  await expect(settings.getByText('Reminder settings saved.')).toBeVisible()
  const expected = {
    ...defaultReviewReminderSettings,
    enabled: true,
    target: 'older',
    frequency: 'daily',
    quietHoursEnabled: false,
  }
  await expect
    .poll(async () => readStorage(serviceWorker, ['reviewReminderSettings']))
    .toEqual({ reviewReminderSettings: expected })
  await expect
    .poll(async () =>
      serviceWorker.evaluate(async () =>
        Boolean(await chrome.alarms.get('reviewSavedTabs')),
      ),
    )
    .toBe(true)
  await page.reload()
  await expect(settings.getByLabel('Enable review reminders')).toBeChecked()
  await settings.screenshot({ path: '/tmp/issue-366-review-settings.png' })

  // Exercise the browser alarm API and the production background listener.
  await serviceWorker.evaluate(async () =>
    chrome.alarms.create('reviewSavedTabs', { when: Date.now() + 100 }),
  )
  await expect
    .poll(async () => {
      const data = NotificationStorageSchema.parse(
        await readStorage(serviceWorker, ['reviewReminderNotification']),
      )
      return data.reviewReminderNotification
    })
    .toMatchObject({ settings: expected })
  const data = NotificationStorageSchema.parse(
    await readStorage(serviceWorker, ['reviewReminderNotification']),
  )
  const notification = data.reviewReminderNotification
  expect(notification).toBeDefined()
  const params = new URLSearchParams({
    review: '1',
    target: 'older',
    olderThanDays: '30',
    categoryId: '',
    reviewAt: String(notification?.reviewAt),
  })
  await page.goto(
    getExtensionUrl(extensionId, `app.html#/saved-tabs?${params}`),
  )
  await expect(
    page.getByRole('heading', { name: 'Review saved tabs' }),
  ).toBeVisible()
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(
    page.getByRole('region', { name: 'Review saved tabs' }),
  ).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Tabs to review: 1')
  await expect(page.getByText('Old saved URL', { exact: true })).toBeVisible()
  await expect(page.getByText('New saved URL', { exact: true })).toBeHidden()
  await expect(
    page.getByText('Unknown saved date', { exact: true }),
  ).toBeHidden()
  await expect(
    page.getByRole('link', { name: 'Open tab Old saved URL' }),
  ).toHaveAttribute('href', 'https://example.com/old')
  await page.screenshot({
    path: '/tmp/issue-366-review-list.png',
    fullPage: true,
  })

  await page
    .getByRole('link', { name: 'Reminder settings', exact: true })
    .click()
  await settings.getByLabel('Enable review reminders').uncheck()
  await settings
    .getByRole('button', { name: 'Save reminder settings', exact: true })
    .click()
  await expect(settings.getByText('Reminder settings saved.')).toBeVisible()
  await expect
    .poll(async () =>
      serviceWorker.evaluate(async () =>
        Boolean(await chrome.alarms.get('reviewSavedTabs')),
      ),
    )
    .toBe(false)
  await expect
    .poll(async () =>
      readStorage(serviceWorker, ['reviewReminderNotification']),
    )
    .toEqual({})
  expect(await readPersistenceV2SavedTabsSnapshot(serviceWorker)).toEqual(
    original,
  )
})
