import type { Page } from '@playwright/test'

import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import { assertNoAxeViolations } from './helpers/axe'
import {
  createBaseSeed,
  defaultUserSettings,
  expect,
  getExtensionUrl,
  seedSavedTabsFixture,
  test,
} from './helpers/extension'

/**
 * Issue #1021: 高倍率ズーム・forced-colors・キーボード only 操作の回帰検証。
 *
 * 既存の axe smoke test (saved-tabs / options) が拾えない別軸を補う:
 * - 200% / 400% ズーム相当の狭幅 viewport で水平スクロールや
 *   主要操作要素の破綻がないこと
 * - forced-colors (Windows ハイコントラスト相当) で focus indicator が
 *   視認でき、主要操作が可能なこと
 * - キーボードのみで検索・削除・削除確認・Undo が完結すること
 *
 * ズーム相当の考え方: 基準幅 1280px に対し 200% = 640px、400% = 320px の
 * CSS viewport 幅で再現する。ブラウザ実ズームや OS 設定そのものは
 * Playwright から再現できないため、docs/testing/a11y-regression.md の
 * 手動チェックリスト側で扱う。
 */

const seedTwoTabs = async (
  serviceWorker: Parameters<typeof seedSavedTabsFixture>[0],
  userSettings: Record<string, unknown> = {},
) => {
  const now = Date.now()
  const urls = [
    createUrlFixture('u1', 'https://example.com/1', 'needle Alpha', now),
    createUrlFixture('u2', 'https://example.com/2', 'Beta page', now),
  ]
  await seedSavedTabsFixture(serviceWorker, {
    persistence: {
      categories: [],
      collections: [
        createDomainCollectionFixture('c1', 'example.com', now),
        createCustomCollectionFixture('p1', 'Project One', now, 1),
      ],
      groups: [],
      memberships: urls.flatMap((url, index) => [
        createMembershipFixture('c1', url.id, now, index),
        createMembershipFixture('p1', url.id, now, index),
      ]),
      urls,
    },
    storage: createBaseSeed({
      userSettings: {
        ...defaultUserSettings,
        clickBehavior: 'saveCurrentTab',
        ...userSettings,
      },
    }),
  })
}

const expectNoHorizontalOverflow = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(
    metrics.scrollWidth,
    `${label}: document horizontal overflow`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1)
}

const expectWithinViewport = async (
  page: Page,
  locator: ReturnType<Page['getByRole']>,
  label: string,
) => {
  const box = await locator.boundingBox()
  expect(box, `${label}: bounding box`).not.toBeNull()
  const viewport = page.viewportSize()
  expect(viewport, `${label}: viewport`).not.toBeNull()
  if (box && viewport) {
    expect(box.x, `${label}: left edge`).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, `${label}: right edge`).toBeLessThanOrEqual(
      viewport.width + 1,
    )
  }
}

const isSearchFocused = () => {
  const active = document.activeElement
  return active instanceof HTMLInputElement && active.placeholder === 'Search'
}

const isButtonFocusedWithText = (text: string) => {
  const active = document.activeElement
  return (
    active instanceof HTMLButtonElement &&
    (active.textContent?.trim().startsWith(text) ?? false)
  )
}
// NOTE: 上記はブラウザ側で単独で評価されるため、外部スコープを参照しない。

const isDeleteTabFocused = () => {
  const active = document.activeElement
  return (
    active instanceof HTMLButtonElement &&
    active.getAttribute('aria-label') === 'Delete tab'
  )
}

/** Tab を繰り返し、述語が真になる要素までキーボードで移動する。 */
const tabUntil = async (
  page: Page,
  predicate: (arg: string) => boolean,
  arg = '',
  maxTabs = 60,
): Promise<boolean> => {
  for (let step = 0; step < maxTabs; step += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential keyboard navigation
    await page.keyboard.press('Tab')
    // eslint-disable-next-line no-await-in-loop -- sequential keyboard navigation
    if (await page.evaluate(predicate, arg)) {
      return true
    }
  }
  return false
}

const focusedOutline = async (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element)
    return {
      style: style.outlineStyle,
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- outlineWidth is a CSS length like "2px", so parseFloat is required
      width: Number.parseFloat(style.outlineWidth),
    }
  })

test.describe('a11y regression accessibility', () => {
  test('200% zoom相当 (640px) で主要画面に水平スクロールと操作破綻がない', async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await seedTwoTabs(serviceWorker)
    await page.setViewportSize({ width: 640, height: 900 })

    for (const mode of ['domain', 'custom'] as const) {
      // eslint-disable-next-line no-await-in-loop -- screens are checked sequentially on one page
      await page.goto(
        getExtensionUrl(extensionId, `app.html#/saved-tabs?mode=${mode}`),
      )
      // eslint-disable-next-line no-await-in-loop -- screens are checked sequentially on one page
      await expect(page.getByText('needle Alpha').first()).toBeVisible()
      // eslint-disable-next-line no-await-in-loop -- screens are checked sequentially on one page
      await expectNoHorizontalOverflow(page, `saved-tabs ${mode} @640px`)
      const search = page.getByRole('textbox', {
        name: 'Search',
        exact: true,
      })
      // eslint-disable-next-line no-await-in-loop -- screens are checked sequentially on one page
      await expect(search).toBeVisible()
      // eslint-disable-next-line no-await-in-loop -- screens are checked sequentially on one page
      await expectWithinViewport(page, search, `search @640px ${mode}`)
    }

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    const exportButton = page.getByRole('button', { name: /export/i })
    await expect(exportButton).toBeVisible()
    await expectNoHorizontalOverflow(page, 'options @640px')
    await expectWithinViewport(page, exportButton, 'export @640px')

    const screenshot = testInfo.outputPath('zoom-200-options.png')
    await page.screenshot({ path: screenshot })
    await testInfo.attach('zoom-200-options', {
      path: screenshot,
      contentType: 'image/png',
    })
  })

  test('400% zoom相当 (320px) でも検索でき主要操作要素が画面内に収まる', async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await seedTwoTabs(serviceWorker)
    await page.setViewportSize({ width: 320, height: 900 })

    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await expect(page.getByText('needle Alpha')).toBeVisible()
    await expect(page.getByText('Beta page')).toBeVisible()
    await expectNoHorizontalOverflow(page, 'saved-tabs domain @320px')

    const search = page.getByRole('textbox', { name: 'Search', exact: true })
    await expect(search).toBeVisible()
    await expectWithinViewport(page, search, 'search @320px')
    await search.fill('needle')
    await expect(page.getByText('needle Alpha')).toBeVisible()
    await expect(page.getByText('Beta page')).toBeHidden()
    await search.fill('')
    await expect(page.getByText('Beta page')).toBeVisible()

    await assertNoAxeViolations(page, 'saved-tabs (domain mode) @320px')

    await page.goto(getExtensionUrl(extensionId, 'app.html#/options'))
    const exportButton = page.getByRole('button', { name: /export/i })
    await expect(exportButton).toBeVisible()
    await expectNoHorizontalOverflow(page, 'options @320px')
    await expectWithinViewport(page, exportButton, 'export @320px')

    const screenshot = testInfo.outputPath('zoom-400-saved-tabs.png')
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await expect(page.getByText('needle Alpha')).toBeVisible()
    await page.screenshot({ path: screenshot })
    await testInfo.attach('zoom-400-saved-tabs', {
      path: screenshot,
      contentType: 'image/png',
    })
  })

  test('forced-colors で focus indicator が視認でき検索操作ができる', async ({
    extensionId,
    page,
    serviceWorker,
  }, testInfo) => {
    await seedTwoTabs(serviceWorker)
    await page.emulateMedia({ forcedColors: 'active' })
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await expect(page.getByText('needle Alpha')).toBeVisible({
      timeout: 15_000,
    })
    expect(
      await page.evaluate(() => matchMedia('(forced-colors: active)').matches),
    ).toBe(true)

    // ボタン到達時: box-shadow の ring は forced-colors で無効化されるため、
    // global.css の :focus-visible outline が視認手段になる。
    expect(await tabUntil(page, isButtonFocusedWithText, 'Select tabs')).toBe(
      true,
    )
    const buttonOutline = await focusedOutline(page)
    expect(buttonOutline.style).toBe('solid')
    expect(buttonOutline.width).toBeGreaterThanOrEqual(2)

    // 検索欄到達時も outline が視認でき、そのまま入力で絞り込める。
    expect(await tabUntil(page, isSearchFocused)).toBe(true)
    const searchOutline = await focusedOutline(page)
    expect(searchOutline.style).toBe('solid')
    expect(searchOutline.width).toBeGreaterThanOrEqual(2)
    await page.keyboard.type('needle')
    await expect(page.getByText('needle Alpha')).toBeVisible()
    await expect(page.getByText('Beta page')).toBeHidden()

    const screenshot = testInfo.outputPath('forced-colors-saved-tabs.png')
    await page.screenshot({ path: screenshot })
    await testInfo.attach('forced-colors-saved-tabs', {
      path: screenshot,
      contentType: 'image/png',
    })
  })

  test('キーボードのみで検索・削除・Undo ができる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedTwoTabs(serviceWorker)
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=domain'),
    )
    await expect(page.getByText('needle Alpha')).toBeVisible({
      timeout: 15_000,
    })

    // 検索: Tab で到達し、入力で絞り込み、キーボードでクリアする。
    expect(await tabUntil(page, isSearchFocused)).toBe(true)
    await page.keyboard.type('Beta')
    await expect(page.getByText('Beta page')).toBeVisible()
    await expect(page.getByText('needle Alpha')).toBeHidden()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
    await expect(page.getByText('needle Alpha')).toBeVisible()

    // 削除: 最初の Delete tab まで Tab で移動し Enter で削除する。
    expect(await tabUntil(page, isDeleteTabFocused)).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.getByText('needle Alpha')).toBeHidden()
    await expect(page.getByText('Beta page')).toBeVisible()

    // Undo: toast の Undo まで Tab で移動し Enter で復元する。
    expect(await tabUntil(page, isButtonFocusedWithText, 'Undo')).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.getByText('needle Alpha')).toBeVisible()
    await expect(page.getByText('Beta page')).toBeVisible()
  })

  test('キーボードで削除確認ダイアログを Escape で取り消し、Enter で確定できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    // 確認ダイアログは custom-bulk-confirm と同じ seed 形状
    // (単一 custom project + confirmDeleteAll) で検証する。
    // domain 経由の confirmDeleteEach は probe で直接削除される挙動を
    // 確認したため、docs/testing/a11y-regression.md に切り分けて記録する。
    const now = Date.now()
    const urls = [
      createUrlFixture('u1', 'https://example.com/1', 'needle Alpha', now),
      createUrlFixture('u2', 'https://example.com/2', 'Beta page', now),
    ]
    await seedSavedTabsFixture(serviceWorker, {
      persistence: {
        categories: [],
        collections: [createCustomCollectionFixture('p1', 'Project One', now)],
        groups: [],
        memberships: urls.map((url, index) =>
          createMembershipFixture('p1', url.id, now, index),
        ),
        urls,
      },
      storage: createBaseSeed({
        userSettings: {
          ...defaultUserSettings,
          confirmDeleteAll: true,
          removeTabAfterOpen: false,
        },
        viewMode: 'custom',
      }),
    })
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    )
    await expect(page.getByTestId('project-url-item')).toHaveCount(2)

    const deleteAll = page.getByRole('button', {
      name: 'Delete all',
      exact: true,
    })
    await deleteAll.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    // ダイアログ表示中はフォーカスが背後のボタンではなくダイアログ内に
    // 移っていること。
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('project-url-item')).toHaveCount(2)

    // 再度開き、ダイアログ内の Delete まで Tab で移動して確定する。
    await deleteAll.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    expect(await tabUntil(page, isButtonFocusedWithText, 'Delete', 10)).toBe(
      true,
    )
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('project-url-item')).toHaveCount(0)
  })

  test('ダイアログをキーボードで開き Escape で閉じた後も操作を再開できる', async ({
    extensionId,
    page,
    serviceWorker,
  }) => {
    await seedTwoTabs(serviceWorker)
    await page.goto(
      getExtensionUrl(extensionId, 'app.html#/saved-tabs?mode=custom'),
    )
    await expect(page.getByText('Project One')).toBeVisible()

    const addProject = page.getByRole('button', {
      name: 'Add project',
      exact: true,
    })
    await addProject.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // 開いた直後はダイアログ内の入力欄にフォーカスがある。
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // Escape 後もトリガーへ戻って再び開ける (フォーカス復帰先の詳細は
    // docs/testing/a11y-regression.md の既知の制約を参照)。
    await addProject.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
