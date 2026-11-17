import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'

import { withFirefoxExtension } from './firefoxExtensionSession'
import type { FirefoxExtensionSession } from './firefoxExtensionSession'

const fixture = `<!doctype html><title>Firefox capture fixture</title><style>body{margin:0;font:16px system-ui}#links{margin:80px 40px;display:grid;grid-template-columns:repeat(5,140px);gap:6px}a{height:24px}</style><div id="links">${Array.from({ length: 30 }, (_, i) => `<a href="/article/${i}">Article ${i}</a>`).join('')}</div>`
const waitFor = async (check: () => Promise<boolean>, label: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- poll the actual native browser state
    if (await check()) {
      return
    }
    // eslint-disable-next-line no-await-in-loop -- bounded browser state polling
    await delay(50)
  }
  throw new Error(`Firefox capture did not reach: ${label}`)
}
const click = async (session: FirefoxExtensionSession, selector: string) => {
  const value = await session.webdriver('/element', {
    using: 'css selector',
    value: selector,
  })
  assert.ok(value && typeof value === 'object')
  const id: unknown = Reflect.get(value, 'element-6066-11e4-a52e-4f735466cecf')
  assert.equal(typeof id, 'string')
  await session.webdriver(`/element/${String(id)}/click`, {})
}
const permissionPrompt = async (
  session: FirefoxExtensionSession,
  accept: boolean,
) => {
  await session.webdriver('/moz/context', { context: 'chrome' })
  try {
    await waitFor(
      async () =>
        (await session.evaluate(
          'return Boolean(PopupNotifications.panel.querySelector("popupnotification"))',
        )) === true,
      'permission prompt',
    )
    const action = accept ? 'button' : 'secondaryButton'
    const clicked = await session.evaluate(
      `const n=PopupNotifications.panel.querySelector('popupnotification'); const button=n?.[arguments[0]]; if(button){button.click();return true} return false`,
      [action],
    )
    assert.equal(clicked, true, 'native permission button available')
  } catch (error) {
    console.info(
      'native permission diagnostic',
      await session.evaluate(
        `return [...Services.wm.getEnumerator('navigator:browser')].map(w=>({url:w.gBrowser.currentURI.spec,state:w.PopupNotifications.panel.state,notifications:[...w.document.querySelectorAll('popupnotification')].map(n=>({id:n.id,hidden:n.hidden}))}))`,
      ),
    )
    throw error
  } finally {
    await session.webdriver('/moz/context', { context: 'content' })
  }
}
const run = async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(fixture)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    const result = await withFirefoxExtension(
      '.output/firefox-mv2',
      async (session) => {
        await session.navigate('icon/128.png')
        await waitFor(
          async () =>
            (await session.evaluate(
              'return browser.storage.local.get("changelogShown").then(value=>value.changelogShown===true)',
            )) === true,
          'installation complete',
        )
        await session.navigate('app.html#/options')
        await session.evaluate(
          'return browser.tabs.getCurrent().then(tab=>browser.tabs.update(tab.id,{active:true}))',
        )
        await waitFor(
          async () =>
            (await session.evaluate(
              'return Boolean(document.querySelector("#link-capture-enabled") && !document.querySelector("#link-capture-enabled").disabled)',
            )) === true,
          'options ready',
        )
        assert.equal(
          await session.evaluate(
            'return browser.permissions.contains({permissions:["scripting"],origins:["http://*/*","https://*/*"]})',
          ),
          false,
        )
        await click(session, '#link-capture-enabled')
        await permissionPrompt(session, false)
        await waitFor(
          async () =>
            (await session.evaluate(
              'return document.querySelector("#link-capture-enabled").getAttribute("aria-checked")==="false"',
            )) === true,
          'permission denied stays off',
        )
        await click(session, '#link-capture-enabled')
        await permissionPrompt(session, true)
        await waitFor(
          async () =>
            (await session.evaluate(
              'return document.querySelector("#link-capture-enabled").getAttribute("aria-checked")==="true"',
            )) === true,
          'permission granted enabled',
        )
        const extensionHandle = await session.webdriver(
          '/window',
          undefined,
          'GET',
        )
        const opened = await session.webdriver('/window/new', { type: 'tab' })
        assert.ok(opened && typeof opened === 'object')
        const sourceHandle: unknown = Reflect.get(opened, 'handle')
        await session.webdriver('/window', { handle: sourceHandle })
        await session.webdriver('/url', {
          url: `http://127.0.0.1:${address.port}/list`,
        })
        await waitFor(
          async () =>
            (await session.evaluate(
              'return Boolean(document.querySelector("[data-tabbin-link-capture]"))',
            )) === true,
          'content injection',
        )
        await session.webdriver('/window', { handle: extensionHandle })
        const before = await session.evaluate(
          'return browser.tabs.query({}).then(tabs=>tabs.map(({id,url})=>({id,url})).sort((a,b)=>a.id-b.id))',
        )
        await session.webdriver('/window', { handle: sourceHandle })
        await session.webdriver('/actions', {
          actions: [
            {
              type: 'key',
              id: 'keyboard',
              actions: [{ type: 'keyDown', value: 'z' }],
            },
          ],
        })
        await session.webdriver('/actions', {
          actions: [
            {
              type: 'pointer',
              id: 'mouse',
              parameters: { pointerType: 'mouse' },
              actions: [
                {
                  type: 'pointerMove',
                  origin: 'viewport',
                  x: 32,
                  y: 72,
                  duration: 0,
                },
                { type: 'pointerDown', button: 0 },
                {
                  type: 'pointerMove',
                  origin: 'viewport',
                  x: 750,
                  y: 258,
                  duration: 500,
                },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ],
        })
        await session.webdriver('/actions', {
          actions: [
            {
              type: 'key',
              id: 'keyboard',
              actions: [{ type: 'keyUp', value: 'z' }],
            },
          ],
        })
        await waitFor(
          async () =>
            (await session.evaluate(
              'return document.querySelector("[data-tabbin-link-capture]")?.dataset.captureStatus?.includes("Saved: 30") ?? false',
            )) === true,
          'saved 30 links',
        )
        await session.webdriver('/window', { handle: extensionHandle })
        assert.deepEqual(
          await session.evaluate(
            'return browser.tabs.query({}).then(tabs=>tabs.map(({id,url})=>({id,url})).sort((a,b)=>a.id-b.id))',
          ),
          before,
        )
        const saved = await session.evaluate(
          `return new Promise((resolve,reject)=>{const r=indexedDB.open('tabbin-persistence-v2');r.onsuccess=()=>{const db=r.result;const q=db.transaction('urls').objectStore('urls').getAll();q.onsuccess=()=>{db.close();resolve(q.result.length)};q.onerror=()=>reject(q.error)};r.onerror=()=>reject(r.error)})`,
        )
        assert.equal(saved, 30)
        await session.webdriver('/window', { handle: sourceHandle })
        await session.evaluate(
          'document.body.dataset.restoreMarker="capture"; window.addEventListener("pageshow", event=>{document.body.dataset.persisted=String(event.persisted)})',
        )
        await session.webdriver('/url', {
          url: `http://127.0.0.1:${address.port}/away`,
        })
        await session.webdriver('/back', {})
        await waitFor(
          async () =>
            (await session.evaluate(
              'return Boolean(document.querySelector("[data-tabbin-link-capture]"))',
            )) === true,
          'back navigation resumes active capture',
        )
        const bfCacheRestored = await session.evaluate(
          'return document.body.dataset.persisted==="true"',
        )
        await session.webdriver('/url', {
          url: `http://127.0.0.1:${address.port}/away`,
        })
        await session.webdriver('/window', { handle: extensionHandle })
        await session.evaluate(
          'return browser.permissions.remove({origins:["http://*/*","https://*/*"]})',
        )
        await session.webdriver('/window', { handle: sourceHandle })
        await waitFor(
          async () =>
            (await session.evaluate(
              'return document.querySelector("[data-tabbin-link-capture]")===null',
            )) === true,
          'revocation disposes source',
        )
        await session.webdriver('/back', {})
        await waitFor(
          async () =>
            (await session.evaluate(
              'return document.querySelector("[data-tabbin-link-capture]")===null',
            )) === true,
          'cached revoked page resumes without listeners',
        )
        return {
          bfCacheRestored,
          backNavigationResume: true,
          permissionRevocationAfterBack: true,
          firefoxVersion: session.version,
          saved,
          permissionDenied: true,
          permissionGranted: true,
          tabIdentityPreserved: true,
          permissionRevocation: true,
        }
      },
    )
    console.info(JSON.stringify(result, null, 2))
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }),
    )
  }
}
await run()
