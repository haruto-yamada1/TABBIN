import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

let bundleDirectory: string
let harnessSource: string

test.beforeAll(async () => {
  bundleDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-corrupt-persistence-'),
  )
  const bundlePath = path.join(bundleDirectory, 'harness.js')
  execFileSync('bun', [
    'build',
    'e2e/support/corrupt-persistence-browser-harness.ts',
    `--outfile=${bundlePath}`,
    '--target=browser',
    '--format=iife',
    '--define',
    'import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}',
  ])
  harnessSource = await readFile(bundlePath, 'utf8')
})

test.afterAll(async () => {
  if (bundleDirectory) {
    await rm(bundleDirectory, { force: true, recursive: true })
  }
})

const initializePage = async (
  page: Page,
  scenario: Parameters<Window['__tabbinCorruptPersistence']['seed']>[0],
) => {
  const diagnostics: string[] = []
  page.on('console', (message) => diagnostics.push(message.text()))
  page.on('pageerror', (error) => diagnostics.push(error.message))
  await page.route('https://tabbin.test/**', async (route) => {
    const script = new URL(route.request().url()).pathname === '/harness.js'
    await route.fulfill({
      body: script
        ? harnessSource
        : '<!doctype html><title>Persistence recovery</title><script src="/harness.js"></script>',
      contentType: script ? 'application/javascript' : 'text/html',
    })
  })
  await page.goto('https://tabbin.test/corrupt-persistence')
  await page.evaluate(
    async ({ databaseName, scenario }) => {
      window.__initializeTabbinCorruptPersistence(databaseName)
      await window.__tabbinCorruptPersistence.seed(scenario)
    },
    { databaseName: `tabbin-corrupt-${randomUUID()}`, scenario },
  )
  return diagnostics
}

// Decode independently in the test so the rescue must retain the native value,
// including NaN, rather than passing only a comparison of two encoded files.
const decodeRecoveryValue = (encoded: unknown): unknown => {
  if (!Array.isArray(encoded)) {
    throw new TypeError('Expected a tagged recovery value.')
  }
  const [tag, value]: readonly unknown[] = encoded
  if (tag === 'json') {
    return value
  }
  if (tag === 'number' && value === 'NaN') {
    return Number.NaN
  }
  if (tag === 'array' && Array.isArray(value)) {
    return value.map(decodeRecoveryValue)
  }
  if (tag === 'object' && Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry: unknown) => {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string') {
          throw new TypeError('Expected a tagged recovery object entry.')
        }
        return [entry[0], decodeRecoveryValue(entry[1])]
      }),
    )
  }
  throw new Error('Unexpected recovery value in corruption fixture.')
}

const PRIVATE_MARKERS = [
  'https://private.example.test/sensitive',
  'private.example.test',
  'Private saved title',
  'Private membership note',
  'Private orphan category',
  'Private invalid timestamp',
] as const

for (const { scenario, issueCode } of [
  { scenario: 'missing-url', issueCode: 'URL_MISSING' },
  { scenario: 'missing-collection', issueCode: 'COLLECTION_MISSING' },
  { scenario: 'missing-category', issueCode: 'CATEGORY_MISSING' },
  { scenario: 'missing-group', issueCode: 'GROUP_MISSING' },
  { scenario: 'orphan-category', issueCode: 'ORPHAN_CATEGORY' },
  { scenario: 'nonnumeric-date', issueCode: null },
  { scenario: 'nan-date', issueCode: null },
] as const) {
  test(`native ${scenario} remains unavailable after retry and can be rescued without mutation`, async ({
    page,
  }) => {
    const diagnostics = await initializePage(page, scenario)
    const before = await page.evaluate(async () =>
      window.__tabbinCorruptPersistence.rawSnapshot(),
    )
    const rejected = await page.evaluate(async () =>
      window.__tabbinCorruptPersistence.read(),
    )
    expect(rejected).toMatchObject({
      status: 'rejected',
      code: 'PERSISTENCE_RECOVERY_REQUIRED',
      name: issueCode
        ? 'PersistenceSnapshotIntegrityError'
        : 'PersistenceRecordDecodeError',
      issueCodes: issueCode ? expect.arrayContaining([issueCode]) : [],
    })
    const unavailable = {
      errorCode: 'PERSISTENCE_RECOVERY_REQUIRED',
      status: 'unavailable',
    }
    expect(
      await page.evaluate(() =>
        window.__tabbinCorruptPersistence.recoveryState(),
      ),
    ).toEqual(unavailable)

    const retried = await page.evaluate(async () =>
      window.__tabbinCorruptPersistence.retry(),
    )
    expect(retried).toEqual(rejected)
    expect(
      await page.evaluate(() =>
        window.__tabbinCorruptPersistence.recoveryState(),
      ),
    ).toEqual(unavailable)

    const rescue = await page.evaluate(async () =>
      window.__tabbinCorruptPersistence.rescue(),
    )
    expect(rescue).toMatchObject({
      encoding: 'tagged-json-v1',
      format: 'tabbin-saved-tabs-recovery',
      version: 1,
    })
    const restoredStores = Object.fromEntries(
      Object.entries(rescue.stores).map(([name, value]) => [
        name,
        decodeRecoveryValue(value),
      ]),
    )
    const rescueStores = [
      'collectionCategories',
      'collectionGroups',
      'collectionMemberships',
      'collections',
      'metadata',
      'urls',
    ]
    expect(Object.keys(restoredStores).toSorted()).toEqual(rescueStores)
    expect(restoredStores).toEqual(
      Object.fromEntries(rescueStores.map((name) => [name, before[name]])),
    )
    const inspection = await page.evaluate(
      async (input) => window.__tabbinCorruptPersistence.inspectBackup(input),
      JSON.stringify(rescue),
    )
    expect(inspection).toMatchObject({
      status: 'rejected',
      code: 'UNSUPPORTED_LEGACY_BACKUP',
    })
    expect(
      await page.evaluate(async () =>
        window.__tabbinCorruptPersistence.rawSnapshot(),
      ),
    ).toEqual(before)
    const diagnosticText = JSON.stringify([
      rejected,
      retried,
      inspection,
      ...diagnostics,
    ])
    for (const marker of PRIVATE_MARKERS) {
      expect(diagnosticText).not.toContain(marker)
    }
  })
}

test('a native orphan URL warning remains readable and exportable without deleting the URL', async ({
  page,
}) => {
  await initializePage(page, 'orphan-url')
  const before = await page.evaluate(async () =>
    window.__tabbinCorruptPersistence.rawSnapshot(),
  )
  const read = await page.evaluate(async () =>
    window.__tabbinCorruptPersistence.read(),
  )
  expect(read).toMatchObject({
    status: 'fulfilled',
    value: {
      integrity: {
        isHealthy: false,
        issues: [{ code: 'ORPHAN_URL', severity: 'warning' }],
      },
      revision: 7,
      savedTabs: { memberships: [], urls: before.urls },
    },
  })
  const backup = await page.evaluate(async () =>
    window.__tabbinCorruptPersistence.exportBackup(),
  )
  expect(backup).toMatchObject({
    data: { savedTabs: { memberships: [], urls: before.urls } },
    schemaVersion: 2,
  })
  expect(
    await page.evaluate(() =>
      window.__tabbinCorruptPersistence.recoveryState(),
    ),
  ).toEqual({ status: 'available' })
  expect(
    await page.evaluate(async () =>
      window.__tabbinCorruptPersistence.rawSnapshot(),
    ),
  ).toEqual(before)
})
