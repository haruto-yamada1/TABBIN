import {
  createBaseSeed,
  expect,
  getExtensionUrl,
  readPersistenceV2SavedTabsSnapshot,
  seedSavedTabsFixture,
} from './helpers/extension'
import { test } from './helpers/native-tab-title'

const scenarios = [
  { id: 'absolute-escape', visible: true },
  { id: 'positioned-clip', inner: 'position:relative', visible: false },
  { id: 'normal-clip', position: 'relative', visible: false },
  { id: 'fixed-escape', position: 'fixed', visible: true },
  {
    id: 'fixed-filter-clip',
    inner: 'filter:blur(0)',
    position: 'fixed',
    visible: false,
  },
  {
    id: 'fixed-contain-clip',
    inner: 'contain:layout',
    position: 'fixed',
    visible: false,
  },
  {
    id: 'fixed-transform-escape',
    outer: 'transform:translate(0)',
    position: 'fixed',
    visible: true,
  },
  { id: 'absolute-wrapper-escape', wrapper: true, visible: true },
  { id: 'absolute-filter-clip', inner: 'filter:blur(0)', visible: false },
  {
    id: 'fixed-transform-clip',
    inner: 'transform:translate(0)',
    position: 'fixed',
    visible: false,
  },
] as const

const fixture = `<!doctype html><title>Capture containing blocks</title>
<style>body{margin:0;font:16px system-ui}.outer{position:absolute;left:100px;width:300px;height:30px}.clip{overflow:hidden;width:40px;height:30px}a{display:block;width:80px;height:20px;background:cyan}</style>
${scenarios
  .map((scenario, index) => {
    const { id, visible: _visible, ...styles } = scenario
    const top = 50 + index * 50
    const position = 'position' in styles ? styles.position : 'absolute'
    const outer = 'outer' in styles ? styles.outer : ''
    const inner = 'inner' in styles ? styles.inner : ''
    const viewportFixed = position === 'fixed' && !outer && !inner
    const wrapped = 'wrapper' in styles
    const link = `<a id="${id}" href="https://capture-geometry.example.test/${id}" style="position:${wrapped ? 'static' : position};left:${viewportFixed ? 180 : 80}px;top:${viewportFixed ? top + 5 : 5}px">${id}</a>`
    return `<div class="outer" style="top:${top}px;${outer}"><div class="clip" style="${inner}">${wrapped ? `<div style="position:absolute;left:80px;top:5px">${link}</div>` : link}</div></div>`
  })
  .join('')}`

test.use({ pregrantNativeTitle: true })

test('capture follows containing blocks and saves only links painted outside overflow containers', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  await seedSavedTabsFixture(serviceWorker, {
    storage: createBaseSeed({
      linkCaptureSettings: {
        enabled: true,
        shortcut: {
          code: 'KeyZ',
          key: 'z',
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          metaKey: false,
        },
      },
    }),
    persistence: {
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: [],
    },
  })
  await page.goto(getExtensionUrl(extensionId, 'icon/128.png'))
  await extensionContext.route(
    'https://capture-geometry.example.test/**',
    async (route) => route.fulfill({ contentType: 'text/html', body: fixture }),
  )
  const source = await extensionContext.newPage()
  await source.goto('https://capture-geometry.example.test/list')
  const overlay = source.locator('[data-tabbin-link-capture]')
  await expect(overlay).toHaveCount(1)
  expect(
    await source.evaluate(() =>
      [...document.querySelectorAll('a')].map((link) => {
        const bounds = link.getBoundingClientRect()
        return {
          id: link.id,
          visible:
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ) === link,
        }
      }),
    ),
  ).toEqual(scenarios.map(({ id, visible }) => ({ id, visible })))
  await source.keyboard.down('z')
  await source.mouse.move(40, 40)
  await source.mouse.down()
  await source.mouse.move(420, 560, { steps: 12 })
  await expect(overlay).toHaveAttribute('data-selected-count', '4')
  await source.mouse.up()
  await source.keyboard.up('z')
  await expect(source.getByRole('status')).toContainText('Saved: 4')
  expect(
    (await readPersistenceV2SavedTabsSnapshot(page)).urls
      .map(({ url }) => url)
      .toSorted((a, b) => a.localeCompare(b)),
  ).toEqual(
    scenarios
      .filter(({ visible }) => visible)
      .map(({ id }) => `https://capture-geometry.example.test/${id}`)
      .toSorted((a, b) => a.localeCompare(b)),
  )
})
