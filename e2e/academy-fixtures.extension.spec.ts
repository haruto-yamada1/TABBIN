import { createAcademyFixture } from '#academy-fixture'

import { resetAcademyFixture } from './helpers/academy-fixture'
import {
  expect,
  readPersistenceV2SavedTabsSnapshot,
  test,
} from './helpers/extension'

test('minimal fixture groups fictional hostnames in the real Saved Tabs UI', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}, testInfo) => {
  await resetAcademyFixture({
    extensionContext,
    extensionId,
    page,
    serviceWorker,
  })
  const domains = page.getByTestId('domain-scroll-target')
  await expect(domains.getByRole('heading', { level: 2 })).toHaveText([
    'study.filming.test',
    'notes.filming.test',
    'garden.filming.test',
  ])
  await expect(domains).toHaveCount(3)
  await Promise.all(
    (
      [
        ['study.filming.test', ['Study guide', 'Study reference']],
        ['notes.filming.test', ['Notebook ideas', 'Notebook inbox']],
        ['garden.filming.test', ['Garden seeds', 'Garden journal']],
      ] as const
    ).flatMap(([hostname, titles]) => {
      const domain = domains.filter({
        has: page.getByRole('heading', { name: hostname, exact: true }),
      })
      return titles.map(async (title) => {
        await expect(domain.getByText(title, { exact: true })).toBeVisible()
      })
    }),
  )
  await expect(
    page.getByText('Learning', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByText('Personal', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Guides', exact: true }),
  ).toBeVisible()
  await testInfo.attach('academy-minimal-fixture', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
})

test('reset replaces URLs, parent/child categories and browser tabs repeatedly', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  const scene = { extensionContext, extensionId, page, serviceWorker }
  const verifyReset = async (scenario: 'minimal' | 'empty') => {
    const oldTab = await extensionContext.newPage()
    await oldTab.goto('about:blank#previous-recording')
    await resetAcademyFixture(scene, scenario)
    expect(oldTab.isClosed()).toBe(true)
    expect(extensionContext.pages()).toEqual([page])
    const { revision, ...snapshot } =
      await readPersistenceV2SavedTabsSnapshot(serviceWorker)
    expect(revision).toBe(1)
    for (const key of [
      'urls',
      'collections',
      'groups',
      'categories',
      'memberships',
    ] as const) {
      expect(snapshot[key]).toEqual(
        expect.arrayContaining(createAcademyFixture(scenario)[key]),
      )
      expect(snapshot[key]).toHaveLength(
        createAcademyFixture(scenario)[key].length,
      )
    }
    await expect(page.getByTestId('sortable-url-item')).toHaveCount(
      scenario === 'empty' ? 0 : 6,
    )
  }
  await verifyReset('minimal')
  await verifyReset('empty')
  await verifyReset('minimal')
  await verifyReset('empty')
  await verifyReset('minimal')
})
