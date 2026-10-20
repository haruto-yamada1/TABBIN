/* eslint-disable no-await-in-loop -- workloads must finish sequentially */
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

import type { Page, TestInfo } from '@playwright/test'

// eslint-disable-next-line import/no-relative-parent-imports -- benchmark emits the shared tooling report contract
import type { BudgetSample } from '../tools/performance-budget/report'
import {
  expect,
  getExtensionUrl,
  readPersistenceV2Store,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'
import {
  createRenderingFixture,
  installRenderingProbe,
} from './helpers/rendering-performance'
import { benchmarkSavedTabsSearch } from './helpers/search-performance'

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()

const bunVersion = execFileSync('bun', ['--version'], {
  encoding: 'utf8',
}).trim()

const saveSamples = async (
  page: Page,
  info: TestInfo,
  samples: BudgetSample[],
) => {
  const outputPath = info.outputPath('budget-samples.json')
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        sourceRevision,
        environment: {
          platform: `${process.platform}-${process.arch}`,
          browserVersion: page.context().browser()?.version() ?? 'unknown',
          nodeVersion: process.version,
          bunVersion,
        },
        samples,
      },
      null,
      2,
    ),
  )
  await info.attach('budget-samples', {
    path: outputPath,
    contentType: 'application/json',
  })
}

for (const size of [1_000, 10_000] as const) {
  for (const mode of ['domain', 'custom'] as const) {
    test(`${mode} list and category budget ${size}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(300_000)
      const appUrl = getExtensionUrl(extensionId, 'app.html')
      const fixture = createRenderingFixture(size)
      fixture.persistence.collections = fixture.persistence.collections.map(
        (collection) => ({
          ...collection,
          ...(collection.id === 'domain-0'
            ? { groupId: 'rendering-parent' }
            : {}),
        }),
      )
      await page.goto(`${appUrl}#/options`)
      await seedSavedTabsFixture(page, fixture)
      const before = await readPersistenceV2SavedTabsSnapshot(page)
      await page.goto('about:blank')
      await installRenderingProbe(page)
      await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
      const expected = fixture.persistence.urls.map(({ url }) => url)
      const measure = async (scenario: 'initial' | 'category-switch') =>
        page.evaluate(
          async ({ scenario: operation, expected: urls, mode: view }) =>
            window.tabbinRenderingProbe.measure(
              operation,
              urls,
              view,
              view === 'domain' ? 20 : 5,
            ),
          { scenario, expected, mode },
        )
      const initial = await measure('initial')
      expect(initial.reactCommits).toBeGreaterThan(0)
      expect(initial.operations.session?.started).toBeGreaterThan(0)
      // Trigger geometry availability after content-visibility has laid out the
      // first card. This setup is excluded from the navigation measurement.
      await page.getByTestId('saved-tabs-left-pane').evaluate(async (pane) => {
        pane.scrollTop = 1
        await new Promise(requestAnimationFrame)
        pane.scrollTop = 0
        await new Promise(requestAnimationFrame)
      })
      await expect(
        page.getByRole('button', {
          name:
            mode === 'domain'
              ? 'Scroll to next parent category'
              : 'Scroll to next project',
          exact: true,
        }),
      ).toBeEnabled()
      const navigation = await measure('category-switch')
      expect(
        await page
          .getByTestId('saved-tabs-left-pane')
          .evaluate((pane) => pane.scrollTop),
      ).toBeGreaterThan(0)
      const samples: BudgetSample[] = [initial, navigation].map(
        (sample, index) => {
          expect(sample.renderedUrls).toBe(size)
          for (const operation of Object.values(sample.operations)) {
            expect(operation.started).toBe(operation.completed)
            expect(operation.pendingAtCompletion).toBe(0)
          }
          return {
            scenario: index === 0 ? 'initial' : 'category-switch',
            size,
            mode,
            repeat: info.repeatEachIndex,
            durationMs: sample.durationMs,
            work: {
              readonlyTransactions: sample.readonlyTransactions,
              sessionCalls: sample.operations.session?.started ?? 0,
              pageQueries: sample.operations.pageQuery?.started ?? 0,
              pendingOperations: Object.values(sample.operations).reduce(
                (total, operation) => total + operation.pendingAtCompletion,
                0,
              ),
            },
          }
        },
      )
      expect(
        (await readPersistenceV2Store<{ url: string }>(page, 'urls'))
          .map(({ url }) => url)
          .toSorted(),
      ).toEqual(expected.toSorted())
      expect(
        await readPersistenceV2Store(page, 'collectionMemberships'),
      ).toHaveLength(size * 2)
      expect(await readPersistenceV2SavedTabsSnapshot(page)).toEqual(before)
      await saveSamples(page, info, samples)
    })

    test(`${mode} search budget ${size}`, async ({
      page,
      extensionId,
    }, info) => {
      test.setTimeout(300_000)
      const samples = await benchmarkSavedTabsSearch(
        page,
        getExtensionUrl(extensionId, 'app.html'),
        size,
        mode,
        info,
      )
      expect(samples).toHaveLength(12)
      const durations = samples
        .map((sample) => sample.readWorkSettledMs ?? Number.NaN)
        .toSorted((a, b) => a - b)
      await saveSamples(page, info, [
        {
          scenario: 'search',
          size,
          mode,
          repeat: info.repeatEachIndex,
          durationMs: durations[Math.floor(durations.length / 2)] ?? Number.NaN,
          work: {
            readonlyTransactions: Math.max(
              ...samples.map((sample) => sample.readonlyTransactions),
            ),
          },
        },
      ])
    })
  }

  test(`bulk opening budget ${size}`, async ({ page, extensionId }, info) => {
    test.setTimeout(300_000)
    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    await page.addScriptTag({
      url: getExtensionUrl(extensionId, 'performance-budget-opening.js'),
    })
    const result = await page.evaluate(
      async (count) => window.tabbinBudgetOpening(count),
      size,
    )
    expect(result.work.opened).toBe(size)
    await saveSamples(page, info, [
      {
        scenario: 'bulk-open',
        size,
        mode: 'backgroundTabs',
        repeat: info.repeatEachIndex,
        ...result,
      },
    ])
  })
}
