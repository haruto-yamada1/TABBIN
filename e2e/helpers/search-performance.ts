/* eslint-disable no-await-in-loop -- input samples must run sequentially in the same UI */
import { writeFile } from 'node:fs/promises'

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
  defaultUserSettings,
  seedSavedTabsFixture,
} from './extension'

const rowSelector = 'a[href^="https://search-benchmark-"]'
const now = Date.parse('2026-10-18T00:00:00Z')
const domainCount = 20
const projectCount = 5
// Real 10,000-URL setup/search work exceeded the default 5s in baseline runs.
// This bounds completion, not acceptable latency; slow observations are retained.
// Initial hydration and restoring the full list stay outside timed samples.
const completionTimeout = 60_000
const sampleCount = 12
const titles = ['琥珀夜空 HayStack', '深緑渓谷 RiverSong']
const href = (index: number) =>
  `https://search-benchmark-${index % domainCount}.example/item/${index}`

const createSearchFixture = (size: number) => ({
  storage: createBaseSeed({
    userSettings: { ...defaultUserSettings, language: 'ja' },
  }),
  persistence: {
    categories: [],
    collections: [
      ...Array.from({ length: domainCount }, (_, index) => ({
        ...createDomainCollectionFixture(
          `domain-${index}`,
          `search-benchmark-${index}.example`,
          now,
          index,
        ),
        ...(index === 0 ? { groupId: 'astronomy' } : {}),
      })),
      ...Array.from({ length: projectCount }, (_, index) =>
        createCustomCollectionFixture(
          `project-${index}`,
          `Synthetic project ${index}`,
          now,
          index,
        ),
      ),
    ],
    groups: [
      {
        createdAt: now,
        id: 'astronomy',
        name: '天体観測資料',
        sortOrder: 0,
        updatedAt: now,
      },
    ],
    memberships: Array.from({ length: size }, (_, index) => [
      createMembershipFixture(
        `domain-${index % domainCount}`,
        `url-${index}`,
        now,
        index,
      ),
      createMembershipFixture(
        `project-${index % projectCount}`,
        `url-${index}`,
        now,
        index,
      ),
    ]).flat(),
    urls: Array.from({ length: size }, (_, index) =>
      createUrlFixture(
        `url-${index}`,
        href(index),
        titles[index] ?? `Synthetic document ${index}`,
        now,
      ),
    ),
  },
})

type Sample = {
  trusted: boolean
  nextPaintOpportunityMs: number | null
  resultDomMs: number | null
  resultPaintOpportunityMs: number | null
  observedBodyMutations: number
  renderedRows: number
  readonlyTransactions: number
  readWorkSettledMs: number | null
}

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- merge the browser global
  interface Window {
    tabbinSearchProbe: {
      arm: (query: string, expected: string[]) => void
      sample: Sample | null
    }
  }
}

// All latency clocks live inside the page. Two rAF callbacks bracket a paint
// opportunity; they do not prove pixels reached the display. The separate result
// metric requires the exact synthetic URL set and observes a DOM mutation first.
const installInputProbe = async (page: Page) => {
  await page.evaluate((selector) => {
    let pending: { query: string; expected: string[] } | null = null
    let startedAt = 0
    let running: Sample | null = null
    let checking = false
    let readonlyTransactions = 0
    let activeReads = 0
    // eslint-disable-next-line typescript/unbound-method -- rebound with apply to the database
    const originalTransaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function transaction(
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const result = originalTransaction.apply(this, args)
      if (result.mode === 'readonly') {
        readonlyTransactions += 1
        activeReads += 1
        const finish = () => {
          activeReads -= 1
        }
        result.addEventListener('complete', finish, { once: true })
        result.addEventListener('abort', finish, { once: true })
      }
      return result
    }
    const rendered = () =>
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>(selector),
        (link) => link.href,
      ).toSorted()
    const matches = () => {
      if (!pending) {
        return false
      }
      const links = rendered()
      return (
        links.length === pending.expected.length &&
        links.every((link, index) => link === pending?.expected[index])
      )
    }
    const afterPaintOpportunity = (callback: () => void) => {
      requestAnimationFrame(() => requestAnimationFrame(callback))
    }
    const checkResult = () => {
      if (
        !running ||
        checking ||
        running.observedBodyMutations === 0 ||
        !matches()
      ) {
        return
      }
      checking = true
      const sample = running
      sample.resultDomMs = performance.now() - startedAt
      afterPaintOpportunity(() => {
        checking = false
        if (running !== sample) {
          return
        }
        if (!matches()) {
          sample.resultDomMs = null
          return
        }
        sample.resultPaintOpportunityMs = performance.now() - startedAt
        sample.renderedRows = rendered().length
      })
    }
    const observer = new MutationObserver((mutations) => {
      if (running === null) {
        return
      }
      if (running.resultPaintOpportunityMs !== null) {
        return
      }
      running.observedBodyMutations += mutations.length
      checkResult()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    window.tabbinSearchProbe = {
      arm(query, expected) {
        pending = { query, expected: [...expected].toSorted() }
        running = null
        checking = false
        this.sample = null
      },
      sample: null,
    }
    document.addEventListener(
      'input',
      (event) => {
        if (
          !(event.target instanceof HTMLInputElement) ||
          event.target.getAttribute('aria-label') !== '検索' ||
          event.target.value !== pending?.query
        ) {
          return
        }
        startedAt = performance.now()
        const sample: Sample = {
          trusted: event.isTrusted,
          nextPaintOpportunityMs: null,
          resultDomMs: null,
          resultPaintOpportunityMs: null,
          observedBodyMutations: 0,
          renderedRows: 0,
          readonlyTransactions: 0,
          readWorkSettledMs: null,
        }
        const initialReads = readonlyTransactions
        const settleReads = () => {
          if (running !== sample) {
            return
          }
          const observedReads = readonlyTransactions
          afterPaintOpportunity(() => {
            if (
              activeReads === 0 &&
              observedReads === readonlyTransactions &&
              sample.resultPaintOpportunityMs !== null
            ) {
              sample.readonlyTransactions = readonlyTransactions - initialReads
              sample.readWorkSettledMs = performance.now() - startedAt
            } else {
              settleReads()
            }
          })
        }
        running = sample
        settleReads()
        window.tabbinSearchProbe.sample = sample
        afterPaintOpportunity(() => {
          sample.nextPaintOpportunityMs = performance.now() - startedAt
          checkResult()
        })
      },
      true,
    )
  }, rowSelector)
}

const waitForRows = async (page: Page, expected: string[]) => {
  await expect
    .poll(
      async () =>
        page
          .locator(rowSelector)
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute('href') ?? '').toSorted(),
          ),
      { timeout: completionTimeout },
    )
    .toEqual([...expected].toSorted())
}

const summarize = (values: number[]) => {
  const sorted = values.toSorted((left, right) => left - right)
  const percentile = (fraction: number) =>
    sorted[Math.ceil(sorted.length * fraction) - 1]
  return {
    count: values.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1),
  }
}

export const benchmarkSavedTabsSearch = async (
  page: Page,
  appUrl: string,
  size: number,
  mode: 'domain' | 'custom',
  testInfo: TestInfo,
) => {
  await page.goto(`${appUrl}#/options`)
  await seedSavedTabsFixture(page, createSearchFixture(size))
  await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
  const search = page.getByRole('textbox', { name: '検索', exact: true })
  await expect(search).toBeVisible()
  await expect(page.locator(rowSelector)).toHaveCount(size, {
    timeout: completionTimeout,
  })
  await search.fill('琥珀夜空')
  await waitForRows(page, [href(0)])
  await installInputProbe(page)

  const samples: Sample[] = []
  // Alternate distinct result sets so a stale DOM cannot satisfy completion.
  // fill uses native browser text insertion; isTrusted is asserted for each input.
  for (let index = 0; index < sampleCount; index += 1) {
    const target = index % 2 === 0 ? 1 : 0
    const query = target === 0 ? '琥珀夜空' : '深緑渓谷'
    await page.evaluate(
      ({ query: next, expected }) => {
        window.tabbinSearchProbe.arm(next, expected)
      },
      { query, expected: [href(target)] },
    )
    await search.fill(query)
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => window.tabbinSearchProbe.sample?.readWorkSettledMs ?? null,
          ),
        { timeout: completionTimeout },
      )
      .not.toBeNull()
    const sample = await page.evaluate(() => window.tabbinSearchProbe.sample)
    expect(sample).not.toBeNull()
    if (!sample) {
      throw new Error('Missing trusted input sample')
    }
    expect(sample.trusted).toBe(true)
    expect(sample.nextPaintOpportunityMs).not.toBeNull()
    expect(sample.observedBodyMutations).toBeGreaterThan(0)
    expect(sample.renderedRows).toBe(1)
    samples.push(sample)
  }

  // Partial, case-insensitive title matching and Japanese queries use real UI.
  await search.fill('HAYSTACK')
  await waitForRows(page, [href(0)])
  await search.fill('深緑渓谷')
  await waitForRows(page, [href(1)])
  if (mode === 'domain') {
    await search.fill('体観測')
    await waitForRows(
      page,
      Array.from({ length: size / domainCount }, (_, index) =>
        href(index * domainCount),
      ),
    )
  }
  await page.getByRole('button', { name: '検索をクリア', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect(page.locator(rowSelector)).toHaveCount(size, {
    timeout: completionTimeout,
  })
  await search.fill('no-such-record-zzzzzzzzzz')
  await waitForRows(page, [])
  await search.selectText()
  await search.pressSequentially('琥珀夜空')
  await search.selectText()
  await search.pressSequentially('深緑渓谷')
  await expect(search).toHaveValue('深緑渓谷')
  await waitForRows(page, [href(1)])

  const numeric = (
    key:
      | 'nextPaintOpportunityMs'
      | 'resultDomMs'
      | 'resultPaintOpportunityMs'
      | 'readWorkSettledMs',
  ) =>
    samples.map((sample) => {
      const value = sample[key]
      if (value === null) {
        throw new Error(`Incomplete ${key} sample`)
      }
      return value
    })
  const outputPath = testInfo.outputPath('search-performance-aggregate.json')
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        browser: page.context().browser()?.browserType().name(),
        mode,
        fixture: {
          uniqueUrls: size,
          domains: domainCount,
          projects: projectCount,
          memberships: size * 2,
          syntheticOnly: true,
        },
        scenario:
          'Warm Japanese title replacement; alternating distinct one-row results',
        methodology:
          'Trusted input capture to double rAF paint opportunity; exact URL-set DOM completion plus a subsequent double rAF. Page performance.now only; no host RPC durations. Readonly IndexedDB transactions count page-local work until zero active reads and two rAF with no new reads after DOM completion. Body mutation records are observed DOM changes, not React render counts.',
        limitations:
          'Observational samples without absolute thresholds; no cold-start or broad-result rendering timing; rAF marks paint opportunities, not physical display presentation; rapid typing does not emulate IME composition.',
        milliseconds: {
          inputToNextPaintOpportunity: summarize(
            numeric('nextPaintOpportunityMs'),
          ),
          inputToResultDom: summarize(numeric('resultDomMs')),
          inputToReadWorkSettled: summarize(numeric('readWorkSettledMs')),
          inputToResultPaintOpportunity: summarize(
            numeric('resultPaintOpportunityMs'),
          ),
        },
        readonlyIndexedDbTransactions: summarize(
          samples.map((sample) => sample.readonlyTransactions),
        ),
        observedBodyMutationRecords: summarize(
          samples.map((sample) => sample.observedBodyMutations),
        ),
        resultRows: summarize(samples.map((sample) => sample.renderedRows)),
      },
      null,
      2,
    ),
    'utf8',
  )
  await testInfo.attach('search-performance-aggregate', {
    path: outputPath,
    contentType: 'application/json',
  })
  return samples
}
