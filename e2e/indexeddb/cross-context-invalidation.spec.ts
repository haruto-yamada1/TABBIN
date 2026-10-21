import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

// eslint-disable-next-line import/no-relative-parent-imports -- reuse the shared E2E notification delivery fault injector
import { holdPersistenceNotifications } from '../helpers/cross-context-sync'

type CanonicalSnapshot = Awaited<ReturnType<typeof readSnapshot>>

let bundleDirectory: string
let harnessSource: string
const savedUrl = 'https://invalidation.test/saved'

test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-cross-context-invalidation-'),
  )
  const bundlePath = path.join(bundleDirectory, 'harness.js')
  execFileSync('bun', [
    'build',
    'e2e/support/cross-context-invalidation-browser-harness.ts',
    `--outfile=${bundlePath}`,
    '--target=browser',
    '--format=iife',
    '--define',
    'import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}',
    '--define',
    'process.env.NODE_ENV="production"',
  ])
  harnessSource = await readFile(bundlePath, 'utf8')
})

test.afterAll(async () => {
  if (bundleDirectory) {
    await rm(bundleDirectory, { force: true, recursive: true })
  }
})

const readSnapshot = async (page: Page) =>
  page.evaluate(async () => window.__tabbinConcurrentPersistence.snapshot())

const expectProjection = async (
  consumers: readonly Page[],
  snapshot: CanonicalSnapshot,
) => {
  for (const consumer of consumers) {
    // eslint-disable-next-line no-await-in-loop -- each independent consumer must converge
    await expect(consumer.getByTestId('persistence-projection')).toHaveText(
      JSON.stringify({
        revision: snapshot.revision,
        savedTabs: snapshot.savedTabs,
      }),
    )
  }
}

const initializePage = async (
  page: Page,
  databaseName: string,
  consumer: boolean,
) => {
  await page.goto('https://tabbin.test/cross-context-invalidation')
  await page.evaluate(
    ({ name, consumer }) => {
      window.__initializeTabbinInvalidation(name, consumer)
    },
    { name: databaseName, consumer },
  )
}

const createPages = async (context: BrowserContext, held = false) => {
  await context.route('https://tabbin.test/**', async (route) => {
    const script = new URL(route.request().url()).pathname === '/harness.js'
    await route.fulfill({
      body: script
        ? harnessSource
        : '<!doctype html><title>Cross-context invalidation</title><div id="root"></div><script src="/harness.js"></script>',
      contentType: script ? 'application/javascript' : 'text/html',
    })
  })
  const databaseName = `tabbin-invalidation-${randomUUID()}`
  const writer = await context.newPage()
  await initializePage(writer, databaseName, false)
  const projectId = await writer.evaluate(async () =>
    window.__tabbinConcurrentPersistence.createProject(),
  )
  if (held) {
    await writer.evaluate(
      async ({ id, url }) => {
        await window.__tabbinConcurrentPersistence.addUrl(id, url)
      },
      { id: projectId, url: savedUrl },
    )
  }
  const consumers = [await context.newPage(), await context.newPage()]
  for (const consumer of consumers) {
    if (held) {
      // eslint-disable-next-line no-await-in-loop -- init script must precede this consumer's navigation
      await holdPersistenceNotifications(consumer)
    }
    // eslint-disable-next-line no-await-in-loop -- isolated page initialization
    await initializePage(consumer, databaseName, true)
  }
  await expectProjection(consumers, await readSnapshot(writer))
  const loadIds = await Promise.all(
    consumers.map(async (consumer) =>
      consumer.evaluate(() => window.__tabbinInvalidationLoadId),
    ),
  )
  return { consumers, loadIds, projectId, writer }
}

const exportChangedBackup = async (writer: Page) => {
  const backup = await writer.evaluate(async () =>
    window.__tabbinConcurrentPersistence.exportBackup(),
  )
  return {
    ...backup,
    data: {
      ...backup.data,
      savedTabs: {
        ...backup.data.savedTabs,
        collections: backup.data.savedTabs.collections.map((collection) => ({
          ...collection,
          name: 'Imported project',
        })),
        urls: backup.data.savedTabs.urls.map((url) => ({
          ...url,
          title: 'Imported Home',
        })),
      },
    },
  }
}

const importBackup = async (writer: Page, backup: unknown) =>
  writer.evaluate(
    async (serialized) =>
      window.__tabbinConcurrentPersistence.importBackup(serialized),
    JSON.stringify(backup),
  )

const deleteSavedUrl = async (writer: Page, projectId: string) => {
  await writer.evaluate(
    async ({ id, url }) => {
      await window.__tabbinConcurrentPersistence.removeUrl(id, url)
    },
    { id: projectId, url: savedUrl },
  )
  const deleted = await readSnapshot(writer)
  expect(deleted.savedTabs.urls).toEqual([])
  return deleted
}

const expectNoReload = async (
  consumers: readonly Page[],
  loadIds: readonly string[],
) => {
  expect(
    await Promise.all(
      consumers.map(async (consumer) =>
        consumer.evaluate(() => window.__tabbinInvalidationLoadId),
      ),
    ),
  ).toEqual(loadIds)
}

test('production consumers follow native save, delete, and Backup V2 import without reload', async ({
  context,
}) => {
  const { consumers, loadIds, projectId, writer } = await createPages(context)
  await writer.evaluate(
    async ({ id, url }) => {
      await window.__tabbinConcurrentPersistence.addUrl(id, url)
    },
    { id: projectId, url: savedUrl },
  )
  const saved = await readSnapshot(writer)
  expect(saved.savedTabs.urls.map(({ url }) => url)).toEqual([savedUrl])
  await expectProjection(consumers, saved)
  const backup = await exportChangedBackup(writer)
  const deleted = await deleteSavedUrl(writer, projectId)
  await expectProjection(consumers, deleted)
  const result = await importBackup(writer, backup)
  const imported = await readSnapshot(writer)
  expect(result.notification.kind).toBe('committed_and_published')
  expect(imported.revision).toBe(deleted.revision + 1)
  expect(result.revision).toBe(imported.revision)
  expect(imported.savedTabs.urls.map(({ title }) => title)).toEqual([
    'Imported Home',
  ])
  await expectProjection(consumers, imported)
  expect(await readSnapshot(writer)).toEqual(imported)
  await expectNoReload(consumers, loadIds)
})

test('focus repairs missed native notifications and reversed duplicate delete/import events converge', async ({
  context,
}) => {
  const { consumers, loadIds, projectId, writer } = await createPages(
    context,
    true,
  )
  const saved = await readSnapshot(writer)
  const backup = await exportChangedBackup(writer)
  const deleted = await deleteSavedUrl(writer, projectId)
  for (const consumer of consumers) {
    // eslint-disable-next-line no-await-in-loop -- wait until each native consumer has held the exact delete
    await expect
      .poll(async () =>
        consumer.evaluate(() => window.__syncNotifications.relevantRevisions()),
      )
      .toContain(deleted.revision)
  }
  await expectProjection(consumers, saved)
  await Promise.all(
    consumers.map(async (consumer) => {
      await consumer.evaluate(() => window.dispatchEvent(new Event('focus')))
    }),
  )
  await expectProjection(consumers, deleted)
  expect(await readSnapshot(writer)).toEqual(deleted)

  await importBackup(writer, backup)
  const imported = await readSnapshot(writer)
  expect(imported.revision).toBe(deleted.revision + 1)
  expect(imported.savedTabs.urls.map(({ title }) => title)).toEqual([
    'Imported Home',
  ])
  await expectProjection(consumers, deleted)
  for (const consumer of consumers) {
    // eslint-disable-next-line no-await-in-loop -- wait for both committed URLs events before reversing delivery
    await expect
      .poll(async () =>
        consumer.evaluate(() => window.__syncNotifications.relevantRevisions()),
      )
      .toEqual(expect.arrayContaining([deleted.revision, imported.revision]))
    // eslint-disable-next-line no-await-in-loop -- deliver within each independent page
    await consumer.evaluate(() =>
      window.__syncNotifications.deliverReversedTwice(),
    )
  }
  await expectProjection(consumers, imported)
  expect(await readSnapshot(writer)).toEqual(imported)
  await expectNoReload(consumers, loadIds)
})
