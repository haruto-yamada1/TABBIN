import { browser } from 'wxt/browser'

import {
  LINK_CAPTURE_ORIGINS,
  LINK_CAPTURE_PERMISSIONS,
  LINK_CAPTURE_SETTINGS_KEY,
} from '@/constants/linkCapture'
import { readLinkCaptureSettings } from '@/lib/storage/link-capture-settings'

import { createLinkCaptureRegistration } from './link-capture-registration'

const SCRIPT_ID = 'tabbin-link-capture'
const SCRIPT_FILE = 'content-scripts/content.js'
const expectedScript = {
  id: SCRIPT_ID,
  js: [SCRIPT_FILE],
  matches: [...LINK_CAPTURE_ORIGINS],
  allFrames: false,
  runAt: 'document_idle' as const,
  persistAcrossSessions: true,
}

const reconcileScript = async (enabled: boolean): Promise<void> => {
  const scriptingAvailable: unknown = Reflect.get(browser, 'scripting')
  if (!scriptingAvailable) {
    if (enabled) {
      throw new Error('Scripting permission unavailable')
    }
    return
  }
  const scripting = browser.scripting
  const scripts = await scripting.getRegisteredContentScripts({
    ids: [SCRIPT_ID],
  })
  const registered = scripts[0]
  if (
    enabled &&
    registered &&
    registered.js?.join(',') === expectedScript.js.join(',') &&
    registered.matches?.join(',') === expectedScript.matches.join(',') &&
    registered.allFrames === false &&
    registered.runAt === expectedScript.runAt &&
    registered.persistAcrossSessions === true
  ) {
    return
  }
  if (registered) {
    await scripting.unregisterContentScripts({ ids: [SCRIPT_ID] })
  }
  if (enabled) {
    await scripting.registerContentScripts([expectedScript])
  }
}

const updateOpenPages = async (enabled: boolean): Promise<void> => {
  const tabs = await browser.tabs.query({})
  await Promise.allSettled(
    tabs.map(async (tab) => {
      if (tab.id === undefined || !/^https?:\/\//u.test(tab.url ?? '')) {
        return
      }
      if (enabled) {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['/content-scripts/content.js'],
        })
      } else {
        await browser.tabs.sendMessage(tab.id, { action: 'linkCaptureDispose' })
      }
    }),
  )
}

const state = createLinkCaptureRegistration({
  readEnabled: async () => {
    const settings = await readLinkCaptureSettings()
    return settings.enabled || settings.clickEnabled
  },
  hasPermissions: async () =>
    browser.permissions.contains({
      permissions: [...LINK_CAPTURE_PERMISSIONS],
      origins: [...LINK_CAPTURE_ORIGINS],
    }),
  reconcileScript,
  updateOpenPages,
})

let registered = false
/** MV3 wake listeners must exist before the first asynchronous policy read. */
export const registerLinkCaptureLifecycle = (): void => {
  if (registered) {
    return
  }
  registered = true
  const refresh = () => {
    void state.reconcile()
  }
  browser.permissions.onAdded.addListener(refresh)
  browser.permissions.onRemoved.addListener(refresh)
  browser.runtime.onInstalled.addListener(refresh)
  browser.runtime.onStartup.addListener(refresh)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, LINK_CAPTURE_SETTINGS_KEY)) {
      refresh()
    }
  })
  refresh()
}
