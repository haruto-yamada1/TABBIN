import { appendFile } from 'node:fs/promises'
import path from 'node:path'

import { readPersistenceV2SavedTabsSnapshot } from '#academy-extension'
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { z } from 'zod'

import type { demonstrationSchema } from './scenario'

const target = (page: Page, name: string) =>
  page.locator(`[data-tour="${name}"]`)
const domain = (page: Page, name: string) =>
  target(page, 'academy-domain').filter({
    has: page.getByRole('heading', { name, exact: true }),
  })
const parent = (page: Page, name: string) =>
  page
    .locator('[data-saved-tabs-scroll-target="parent"]')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
const read = async (seconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, seconds * 1000)
  })
const enter = async (input: Locator, value: string) => {
  await input.fill(value)
  await read(0.8)
  await input.press('Enter')
}
const close = async (dialog: Locator) => {
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click()
  await expect(dialog).toBeHidden()
}

const demonstrateParents = async (
  page: Page,
  checkpoint: (name: string) => Promise<void>,
) => {
  await target(page, 'academy-parent-categories').click()
  const dialog = target(page, 'academy-parent-dialog')
  await enter(target(page, 'academy-parent-create'), 'Learning')
  await expect(dialog.getByRole('combobox')).toContainText('Learning')
  await checkpoint('create Learning')
  await dialog
    .getByRole('checkbox', { name: 'study.filming.test', exact: true })
    .click()
  await checkpoint('assign study domain')
  await enter(target(page, 'academy-parent-create'), 'Personal')
  await expect(dialog.getByRole('combobox')).toContainText('Personal')
  await dialog
    .getByRole('checkbox', { name: 'notes.filming.test', exact: true })
    .click()
  await checkpoint('create Personal and assign notes')
  await close(dialog)
  await parent(page, 'Learning')
    .getByRole('button', { name: /親カテゴリ.*管理|管理.*親カテゴリ/u })
    .click()
  const manage = target(page, 'academy-parent-manage')
  await manage.getByRole('button', { name: 'Learning', exact: true }).click()
  await enter(target(page, 'academy-parent-rename'), 'Learning desk')
  await expect(
    manage.getByRole('button', { name: 'Learning desk', exact: true }),
  ).toBeVisible()
  await checkpoint('rename parent')
  await close(manage)
  await target(page, 'academy-parent-categories').click()
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Learning desk', exact: true }).click()
  await dialog
    .getByRole('checkbox', { name: 'notes.filming.test', exact: true })
    .click()
  await checkpoint('move notes to Learning desk')
  await close(dialog)
  await expect(
    parent(page, 'Learning desk').getByRole('heading', {
      name: 'notes.filming.test',
      exact: true,
    }),
  ).toBeVisible()
}

const demonstrateChildren = async (
  page: Page,
  checkpoint: (name: string) => Promise<void>,
) => {
  const study = domain(page, 'study.filming.test')
  await study.locator('[data-tour="academy-child-categories"]').click()
  await enter(target(page, 'academy-child-create'), 'Reading')
  await expect(target(page, 'academy-child-select')).toContainText('Reading')
  await checkpoint('create child Reading')
  await target(page, 'academy-child-rename-action').click()
  await enter(target(page, 'academy-child-rename'), 'Guides')
  await expect(target(page, 'academy-child-select')).toContainText('Guides')
  await checkpoint('rename child Guides')
  await enter(target(page, 'academy-child-keywords'), 'guide')
  await checkpoint('keyword guide assigns matching URL')
  await enter(target(page, 'academy-child-create'), 'Reference')
  await expect(target(page, 'academy-child-select')).toContainText('Reference')
  await enter(target(page, 'academy-child-keywords'), 'reference')
  await checkpoint('keyword reference moves second URL')
  await close(target(page, 'academy-child-dialog'))
  await expect(
    study
      .getByTestId('sortable-category-section')
      .getByRole('heading', { level: 3 }),
  ).toHaveText(['Guides', 'Reference'])
  await expect(study.getByTestId('sortable-url-item')).toHaveCount(2)
}

const pointerMove = async (
  page: Page,
  handle: Locator,
  destination: Locator,
) => {
  await handle.scrollIntoViewIfNeeded()
  const from = await handle.boundingBox()
  const to = await destination.boundingBox()
  if (!from || !to) {
    throw new Error('The real drag targets must be visible.')
  }
  await page.mouse.move(
    from.x + Math.min(12, from.width / 2),
    from.y + from.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(from.x + 16, from.y + from.height / 2 + 5)
  await read(0.6)
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 25,
  })
  await read(0.8)
  await page.mouse.up()
}
const confirm = async (page: Page, scope: Locator = page.locator('body')) => {
  const button = scope.getByRole('button', {
    name: '親カテゴリの並び替えを確定',
    exact: true,
  })
  await expect(button).toBeVisible()
  await button.click()
  await expect(button).toBeHidden()
}

const demonstrateReorder = async (
  page: Page,
  checkpoint: (name: string) => Promise<void>,
) => {
  const learning = parent(page, 'Learning')
  await pointerMove(
    page,
    learning.locator('[data-tour="academy-parent-drag"]'),
    parent(page, 'Personal'),
  )
  await checkpoint('parent order preview')
  await confirm(page)
  await checkpoint('parent order confirmed')
  const study = domain(page, 'study.filming.test')
  const notes = domain(page, 'notes.filming.test')
  await study.scrollIntoViewIfNeeded()
  await pointerMove(
    page,
    study.locator('[data-tour="academy-domain-drag"]'),
    notes,
  )
  await expect(
    learning
      .locator('[data-tour="academy-domain"]')
      .getByRole('heading', { level: 2 }),
  ).toHaveText(['notes.filming.test', 'study.filming.test'])
  await read(1) // Show the asserted preview before confirming; PointerSensor also suppresses immediate post-drag clicks.
  await confirm(page, learning)
  await checkpoint('domain order confirmed')
  const categories = study.getByTestId('sortable-category-section')
  await pointerMove(
    page,
    study.getByRole('button', {
      name: 'ドラッグしてカテゴリ「Guides」を並べ替える',
      exact: true,
    }),
    categories.filter({
      has: page.getByRole('heading', { name: 'Reference', exact: true }),
    }),
  )
  await expect(categories.getByRole('heading', { level: 3 })).toHaveText([
    'Reference',
    'Guides',
  ])
  await read(1) // Give the viewer time to inspect the real child-order preview.
  await confirm(page, study)
  await expect(categories.getByRole('heading', { level: 3 })).toHaveText([
    'Reference',
    'Guides',
  ])
  await checkpoint('child order confirmed')
}

const demonstrateRestore = async (
  page: Page,
  checkpoint: (name: string) => Promise<void>,
) => {
  const context = page.context()
  const worker = context.serviceWorkers()[0]
  if (!worker) {
    throw new Error('Owned worker missing.')
  }
  const opened = async (host: string) =>
    worker.evaluate(
      async (hostname) =>
        (await chrome.tabs.query({})).filter((tab) => {
          try {
            return (
              new URL(tab.pendingUrl ?? tab.url ?? '').hostname === hostname
            )
          } catch {
            return false
          }
        }).length,
      host,
    )
  const study = domain(page, 'study.filming.test')
  await study.getByTestId('url-title-label').first().click()
  await expect.poll(async () => opened('study.filming.test')).toBe(1)
  await expect(study.getByTestId('sortable-url-item')).toHaveCount(1)
  await checkpoint(
    'one real background tab opened; confirmed saved URL removed',
  )
  await domain(page, 'notes.filming.test')
    .locator('[data-tour="academy-restore-tabs"]')
    .click()
  await expect.poll(async () => opened('notes.filming.test')).toBe(2)
  await expect(domain(page, 'notes.filming.test')).toHaveCount(0)
  await expect(page.getByTestId('sortable-url-item')).toHaveCount(3)
  await checkpoint('two more background tabs opened; three saved URLs remain')
}

/** Fixed, reviewable content actions. No arbitrary selectors, JavaScript or personal URL input. */
export const demonstrateLesson = async (
  page: Page,
  action: z.infer<typeof demonstrationSchema>,
  runDir: string,
) => {
  const started = performance.now()
  const schedule: Record<typeof action.lessonId, number[]> = {
    'parent-categories': [5, 9, 14, 24, 32],
    'child-categories': [9, 15, 24, 31],
    'reorder-items': [5, 8, 16, 22],
    'restore-tabs': [7, 17],
  }
  let step = 0
  const checkpoint = async (name: string) => {
    await appendFile(
      path.join(runDir, 'demonstration.jsonl'),
      `${JSON.stringify({ lessonId: action.lessonId, name, seconds: (performance.now() - started) / 1000 })}\n`,
    )
    const deadline = schedule[action.lessonId][step++]
    const elapsed = (performance.now() - started) / 1000
    if (deadline === undefined || elapsed > deadline + 2) {
      throw new Error(
        'Operation exceeded its caption window. Review the timeline before retrying.',
      )
    }
    await read(Math.max(0, deadline - elapsed)) // Reading time after successful state assertions; aligned with the VTT timeline.
  }
  await read(2)
  switch (action.lessonId) {
    case 'parent-categories': {
      await demonstrateParents(page, checkpoint)
      break
    }
    case 'child-categories': {
      await demonstrateChildren(page, checkpoint)
      break
    }
    case 'reorder-items': {
      await demonstrateReorder(page, checkpoint)
      break
    }
    case 'restore-tabs': {
      await demonstrateRestore(page, checkpoint)
      break
    }
    default: {
      throw new Error('Unsupported demonstration lesson.')
    }
  }
  const worker = page.context().serviceWorkers()[0]
  if (!worker) {
    throw new Error('Owned extension worker missing.')
  }
  const snapshot = await readPersistenceV2SavedTabsSnapshot(worker)
  await appendFile(
    path.join(runDir, 'demonstration.jsonl'),
    `${JSON.stringify({
      lessonId: action.lessonId,
      finalSnapshot: snapshot,
      openedFixtureUrls: (
        await worker.evaluate(async () =>
          (await chrome.tabs.query({})).map(
            (tab) => tab.pendingUrl ?? tab.url ?? '',
          ),
        )
      ).filter(
        (url) =>
          url.startsWith('https://') &&
          new URL(url).hostname.endsWith('.filming.test'),
      ),
    })}\n`,
  )
  const remaining = action.seconds - (performance.now() - started) / 1000
  if (remaining < 1) {
    throw new Error(
      'Demonstration exceeded its reviewed timeline. Adjust the chapter and captions before publishing.',
    )
  }
  await read(remaining + 0.3)
}
