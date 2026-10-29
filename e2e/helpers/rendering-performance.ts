/* eslint-disable no-await-in-loop -- each operation must settle before measuring the next one */
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
  readPersistenceV2Store,
  seedSavedTabsFixture,
} from './extension'

const rowSelector = 'a[href^="https://rendering-benchmark-"]'
const domainCount = 20
const projectCount = 5
const now = Date.parse('2026-10-18T00:00:00Z')
const href = (index: number) =>
  `https://rendering-benchmark-${index % domainCount}.example/item/${index}`

export const createRenderingFixture = (size: number) => ({
  storage: createBaseSeed(),
  persistence: {
    categories: [],
    collections: [
      ...Array.from({ length: domainCount }, (_, index) => ({
        ...createDomainCollectionFixture(
          `domain-${index}`,
          `rendering-benchmark-${index}.example`,
          now,
          index,
        ),
        // Model an existing saved list with initialized category ordering.
        // Omitting this starts first-use auto-save writes during rendering.
        uncategorizedCategoryPosition: 0,
      })),
      ...Array.from({ length: projectCount }, (_, index) => ({
        ...createCustomCollectionFixture(
          `project-${index}`,
          `Synthetic project ${index}`,
          now,
          index,
        ),
        uncategorizedCategoryPosition: 0,
      })),
    ],
    groups: [
      {
        id: 'rendering-parent',
        name: 'Rendering parent category',
        createdAt: now,
        updatedAt: now,
        sortOrder: 0,
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
        `Synthetic document ${index}`,
        now,
      ),
    ),
  },
})

type ReactCommit = {
  id: string
  phase: string
  actualDuration: number
  baseDuration: number
  startTime: number
  commitTime: number
}

type RenderingSample = {
  durationMs: number
  domCompleteMs: number
  readonlyTransactions: number
  domElements: number
  renderedUrls: number
  reactCommits: number
  operations: Record<
    string,
    { started: number; completed: number; pendingAtCompletion: number }
  >
  profilers: Record<
    string,
    {
      callbacks: number
      commits: number
      actualDurationMs: number
      maxActualDurationMs: number
      maxBaseDurationMs: number
    }
  >
  stepsMs: number[]
}

declare global {
  // eslint-disable-next-line typescript/consistent-type-definitions -- merge the browser global
  interface Window {
    tabbinRenderingProbe: {
      beginOperation: (kind: string) => () => void
      recordReactCommit: (commit: ReactCommit) => void
      measure: (
        operation:
          | 'initial'
          | 'scroll'
          | 'collapse'
          | 'expand'
          | 'category-switch',
        expected: string[],
        mode: 'domain' | 'custom',
        expectedCards: number,
      ) => Promise<RenderingSample>
    }
  }
}

export const installRenderingProbe = async (page: Page) => {
  await page.addInitScript((selector: string) => {
    const commits: ReactCommit[] = []
    let readonlyTransactions = 0
    let activeReads = 0
    let activeOperations = 0
    let operationStarts = 0
    const operations: Record<string, { started: number; completed: number }> =
      {}
    // eslint-disable-next-line typescript/unbound-method -- apply preserves the native receiver
    const originalTransaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function transaction(
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const result = originalTransaction.apply(this, args)
      if (result.mode === 'readonly') {
        readonlyTransactions += 1
        activeReads += 1
        const complete = () => {
          activeReads -= 1
        }
        result.addEventListener('complete', complete, { once: true })
        result.addEventListener('abort', complete, { once: true })
      }
      return result
    }
    const paintOpportunity = async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve()
          }),
        )
      })
    const readsAreSettled = () => activeReads === 0
    const operationsAreSettled = () => activeOperations === 0
    const matches = (expected: string[]) => {
      const rows = document.querySelectorAll<HTMLAnchorElement>(selector)
      if (rows.length !== expected.length) {
        return false
      }
      const actual = Array.from(rows, (row) => row.href).toSorted()
      return actual.every((url, index) => url === expected[index])
    }
    const settle = async (expected: string[]) => {
      for (;;) {
        if (readsAreSettled() && operationsAreSettled() && matches(expected)) {
          const readCount = readonlyTransactions
          const commitCount = commits.length
          const operationCount = operationStarts
          const domComplete = performance.now()
          await paintOpportunity()
          if (
            readsAreSettled() &&
            operationsAreSettled() &&
            operationCount === operationStarts &&
            readCount === readonlyTransactions &&
            commitCount === commits.length &&
            matches(expected)
          ) {
            return domComplete
          }
        } else {
          await paintOpportunity()
        }
      }
    }
    const summarizeCommits = (events: ReactCommit[]) => {
      const profilers: RenderingSample['profilers'] = {}
      for (const id of new Set(events.map((event) => event.id))) {
        const matching = events.filter((event) => event.id === id)
        profilers[id] = {
          callbacks: matching.length,
          commits: new Set(matching.map((event) => event.commitTime)).size,
          actualDurationMs: matching.reduce(
            (total, event) => total + event.actualDuration,
            0,
          ),
          maxActualDurationMs: Math.max(
            ...matching.map((event) => event.actualDuration),
          ),
          maxBaseDurationMs: Math.max(
            ...matching.map((event) => event.baseDuration),
          ),
        }
      }
      return profilers
    }
    const navigateCategory = async (mode: 'domain' | 'custom') => {
      const pane = document.querySelector(
        '[data-testid="saved-tabs-left-pane"]',
      )
      const label =
        mode === 'domain'
          ? 'Scroll to next parent category'
          : 'Scroll to next project'
      const button = document.querySelector(`button[aria-label="${label}"]`)
      if (
        !(pane instanceof HTMLElement) ||
        !(button instanceof HTMLButtonElement) ||
        button.disabled
      ) {
        throw new Error('Category navigation is unavailable')
      }
      // Native scrollend completes the real smooth-scroll handler, including
      // layout changes from content-visibility as the next section appears.
      const ended = new Promise<void>((resolve) => {
        pane.addEventListener(
          'scrollend',
          () => {
            resolve()
          },
          { once: true },
        )
      })
      button.click()
      await ended
    }
    window.tabbinRenderingProbe = {
      beginOperation(kind) {
        const counts = operations[kind] ?? { started: 0, completed: 0 }
        operations[kind] = counts
        counts.started += 1
        operationStarts += 1
        activeOperations += 1
        return () => {
          counts.completed += 1
          activeOperations -= 1
        }
      },
      recordReactCommit(commit) {
        commits.push(commit)
      },
      async measure(operation, nextExpected, mode, expectedCards) {
        const expected = nextExpected.toSorted()
        const initial = operation === 'initial'
        const startedAt = initial ? 0 : performance.now()
        const baseline: {
          reads: number
          commits: number
          operations: typeof operations
        } = initial
          ? { reads: 0, commits: 0, operations: {} }
          : {
              reads: readonlyTransactions,
              commits: commits.length,
              operations: structuredClone(operations),
            }
        const stepsMs: number[] = []
        if (operation === 'scroll') {
          const pane = document.querySelector(
            '[data-testid="saved-tabs-left-pane"]',
          )
          if (!(pane instanceof HTMLElement)) {
            throw new TypeError('Missing scroll pane')
          }
          const fractions = Array.from({ length: 13 }, (_, index) => index / 12)
          for (const fraction of [
            ...fractions,
            ...fractions.slice(0, -1).toReversed(),
          ]) {
            const stepStart = performance.now()
            pane.scrollTop = fraction * (pane.scrollHeight - pane.clientHeight)
            await paintOpportunity()
            stepsMs.push(performance.now() - stepStart)
          }
        }
        if (operation === 'category-switch') {
          await navigateCategory(mode)
        }
        if (operation === 'collapse' || operation === 'expand') {
          const kind = mode === 'domain' ? 'domain' : 'project'
          const cards = document.querySelectorAll(
            `[data-saved-tabs-scroll-target="${kind}"]`,
          )
          if (cards.length !== expectedCards) {
            throw new Error(
              `Expected ${expectedCards} cards, got ${cards.length}`,
            )
          }
          const action = operation === 'collapse' ? 'Collapse' : 'Expand'
          for (const card of cards) {
            const button = Array.from(card.querySelectorAll('button')).find(
              (element) => element.getAttribute('aria-label')?.includes(action),
            )
            if (!button) {
              throw new Error(`Missing ${action} button`)
            }
            const stepStart = performance.now()
            button.click()
            await paintOpportunity()
            stepsMs.push(performance.now() - stepStart)
          }
        }
        const domComplete = await settle(expected)
        const events = commits.slice(baseline.commits)
        return {
          durationMs: performance.now() - startedAt,
          domCompleteMs: domComplete - startedAt,
          readonlyTransactions: readonlyTransactions - baseline.reads,
          domElements: document.querySelectorAll('*').length,
          renderedUrls: document.querySelectorAll(selector).length,
          reactCommits: new Set(
            events
              .filter((event) => event.id === 'root')
              .map((event) => event.commitTime),
          ).size,
          operations: Object.fromEntries(
            Object.entries(operations).map(([kind, counts]) => [
              kind,
              {
                started:
                  counts.started - (baseline.operations[kind]?.started ?? 0),
                completed:
                  counts.completed -
                  (baseline.operations[kind]?.completed ?? 0),
                pendingAtCompletion: counts.started - counts.completed,
              },
            ]),
          ),
          profilers: summarizeCommits(events),
          stepsMs,
        }
      },
    }
  }, rowSelector)
}

const verifySettledSample = (sample: RenderingSample, expectedRows: number) => {
  expect(sample.renderedUrls).toBe(expectedRows)
  expect(sample.profilers.root?.callbacks ?? 0).toBe(sample.reactCommits)
  for (const counts of Object.values(sample.operations)) {
    expect(counts.pendingAtCompletion).toBe(0)
    expect(counts.completed).toBe(counts.started)
  }
}

const verifyInitialSample = (sample: RenderingSample | undefined) => {
  expect(sample?.reactCommits ?? 0).toBeGreaterThan(0)
  expect(sample?.operations.session?.started ?? 0).toBeGreaterThan(0)
  expect(
    sample?.profilers.DomainModeContainer?.callbacks ??
      sample?.profilers.CustomModeContainer?.callbacks ??
      0,
  ).toBeGreaterThan(0)
}

export const benchmarkSavedTabsRendering = async (
  page: Page,
  appUrl: string,
  size: number,
  mode: 'domain' | 'custom',
  testInfo: TestInfo,
) => {
  await page.goto(`${appUrl}#/options`)
  await seedSavedTabsFixture(page, createRenderingFixture(size))
  // Hash changes keep the options document and do not run addInitScript.
  await page.goto('about:blank')
  await installRenderingProbe(page)
  const cdp = await page.context().newCDPSession(page)
  const heapObservation = async () => ({
    heap: await cdp.send('Runtime.getHeapUsage'),
    dom: await cdp.send('Memory.getDOMCounters'),
  })
  const expectedUrls = Array.from({ length: size }, (_, index) => href(index))
  await page.goto(`${appUrl}#/saved-tabs?mode=${mode}`)
  const observations = []
  for (const operation of [
    'initial',
    'scroll',
    'collapse',
    'expand',
  ] as const) {
    const sample = await page.evaluate(
      async ({
        operation: current,
        expected,
        mode: currentMode,
        expectedCards,
      }) =>
        window.tabbinRenderingProbe.measure(
          current,
          expected,
          currentMode,
          expectedCards,
        ),
      {
        operation,
        expected: operation === 'collapse' ? [] : expectedUrls,
        mode,
        expectedCards: mode === 'domain' ? domainCount : projectCount,
      },
    )
    verifySettledSample(sample, operation === 'collapse' ? 0 : size)
    observations.push({
      operation,
      ...sample,
      chromium: await heapObservation(),
    })
  }
  const storedUrls = await readPersistenceV2Store<{ url: string }>(page, 'urls')
  const memberships = await readPersistenceV2Store(
    page,
    'collectionMemberships',
  )
  expect(storedUrls.map((url) => url.url).toSorted()).toEqual(
    expectedUrls.toSorted(),
  )
  expect(memberships).toHaveLength(size * 2)
  verifyInitialSample(observations[0])
  const outputPath = testInfo.outputPath('rendering-performance.json')
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        schemaVersion: 2,
        mode,
        repeatIndex: testInfo.repeatEachIndex,
        fixture: {
          uniqueUrls: size,
          domains: domainCount,
          projects: projectCount,
          memberships: size * 2,
          syntheticOnly: true,
          categoryOrderingInitialized: true,
        },
        methodology:
          'Production profiling renderer; build-only root and named subtree Profilers, plus session-operation and page-data-query begin/finally-end probes. Initial timing starts at navigation time origin and includes bootstrap/hydration; later samples use page performance.now. Exact synthetic URL-set DOM completion followed by two rAF with zero active readonly IndexedDB transactions, zero pending session/query operations, no new transactions/operations, and no React commits. Session completion includes settings reads, lock waits, state projection/diff and any commit. The fixture represents existing saved data with initialized category ordering. Scroll sweeps 13 fractions down and 12 back. Collapse/expand invokes each real button handler with page-local DOM click and awaits two rAF per card. No host RPC timings or absolute latency gates.',
        limitations:
          'Each test repeat is a single observation; repeat indices are recorded for aggregation. Session and page-data-query counts overlap and must not be added. Profiler instrumentation adds overhead; actualDuration includes descendants and must not be added across nested profiler ids. Programmatic clicks are not trusted physical input. Double rAF is a paint opportunity, not proof of physical presentation. Fractional scrolling is a repeatable sweep, not proof every row reached the viewport. DOM elements count the current document; CDP DOM counters can include detached nodes. Heap observations use Runtime.getHeapUsage without forced GC and are not leak proof. Native transaction counts and pending operations cover this page only, not background workers or unrelated timers.',
        observations,
        retainedUrls: storedUrls.length,
        retainedMemberships: memberships.length,
      },
      null,
      2,
    ),
    'utf8',
  )
  await testInfo.attach('rendering-performance', {
    path: outputPath,
    contentType: 'application/json',
  })
  await cdp.detach()
  return {
    retainedUrls: storedUrls.length,
    retainedMemberships: memberships.length,
  }
}
