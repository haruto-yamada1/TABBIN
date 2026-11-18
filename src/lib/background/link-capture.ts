import { browser } from 'wxt/browser'

import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import { readLinkCaptureSettings } from '@/lib/storage/link-capture-settings'
import { requireUserSettings } from '@/lib/storage/settings'
import { toSavableLinkUrl } from '@/lib/url-filter'
import {
  emptyLinkCaptureResponse,
  LINK_CAPTURE_CONFIRM_THRESHOLD,
} from '@/types/link-capture'
import type {
  LinkCaptureLink,
  LinkCaptureMessage,
  LinkCaptureResponse,
} from '@/types/link-capture'

const MAX_CACHED_CAPTURE_RESPONSES = 64

type LinkCaptureHandlerDeps = {
  readonly extensionId: () => string
  readonly readEnabled: (mode: 'rectangle' | 'click') => Promise<boolean>
  readonly hasPermission: (origin: string) => Promise<boolean>
  readonly readExcludePatterns: () => Promise<readonly string[]>
  readonly readSavedUrls: () => Promise<readonly string[]>
  readonly saveLinks: (
    links: readonly LinkCaptureLink[],
  ) => Promise<{ readonly savedCount: number; readonly existingCount: number }>
}

const readPublicSenderTabId = (tab: unknown): number | null => {
  if (
    typeof tab !== 'object' ||
    tab === null ||
    Reflect.get(tab, 'incognito') === true
  ) {
    return null
  }
  const id: unknown = Reflect.get(tab, 'id')
  return typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
    ? id
    : null
}

const isSameTabOrigin = (sender: object, origin: string): boolean => {
  const tab: unknown = Reflect.get(sender, 'tab')
  if (typeof tab !== 'object' || tab === null) {
    return false
  }
  const tabUrl: unknown = Reflect.get(tab, 'url')
  return typeof tabUrl !== 'string' || new URL(tabUrl).origin === origin
}

const captureSenderScope = (
  sender: object,
  tabId: number,
  source: string,
): string => {
  const documentId: unknown = Reflect.get(sender, 'documentId')
  return JSON.stringify([
    tabId,
    typeof documentId === 'string' ? documentId : source,
  ])
}

/** Only this extension's isolated top-frame content script can enter this capability. */
const readLinkCaptureSender = (
  sender: unknown,
  extensionId: string,
): { readonly origin: string; readonly scope: string } | null => {
  if (typeof sender !== 'object' || sender === null || !extensionId) {
    return null
  }
  const tab: unknown = Reflect.get(sender, 'tab')
  const source: unknown = Reflect.get(sender, 'url')
  const tabId = readPublicSenderTabId(tab)
  if (
    Reflect.get(sender, 'id') !== extensionId ||
    Reflect.get(sender, 'frameId') !== 0 ||
    tabId === null ||
    typeof source !== 'string'
  ) {
    return null
  }
  try {
    const url = new URL(source)
    const origin: unknown = Reflect.get(sender, 'origin')
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (origin !== undefined && origin !== url.origin) ||
      !isSameTabOrigin(sender, url.origin)
    ) {
      return null
    }
    return {
      origin: url.origin,
      scope: captureSenderScope(sender, tabId, source),
    }
  } catch {
    return null
  }
}

export const linkCaptureSenderOrigin = (
  sender: unknown,
  extensionId: string,
): string | null => readLinkCaptureSender(sender, extensionId)?.origin ?? null

const allowedLink = (
  link: LinkCaptureLink,
  excludePatterns: readonly string[],
): boolean => toSavableLinkUrl(link.url, excludePatterns) !== null

const selectLinks = (
  candidates: readonly LinkCaptureLink[],
  excludePatterns: readonly string[],
) => {
  const links = new Map<string, LinkCaptureLink>()
  let excluded = 0
  let duplicates = 0
  for (const link of candidates) {
    if (!allowedLink(link, excludePatterns)) {
      excluded += 1
    } else if (links.has(link.url)) {
      duplicates += 1
    } else {
      links.set(link.url, link)
    }
  }
  return { links, excluded, duplicates }
}

export const createLinkCaptureHandler = (deps: LinkCaptureHandlerDeps) => {
  // Serialize content captures. The IndexedDB revision check also protects against other contexts.
  let pending: Promise<unknown> = Promise.resolve()
  const completed = new Map<
    string,
    { readonly fingerprint: string; readonly response: LinkCaptureResponse }
  >()
  const handle = async (
    message: LinkCaptureMessage,
    sender: unknown,
  ): Promise<LinkCaptureResponse> => {
    const trustedSender = readLinkCaptureSender(sender, deps.extensionId())
    if (!trustedSender) {
      return emptyLinkCaptureResponse('forbidden')
    }
    const { origin, scope } = trustedSender
    let counts = emptyLinkCaptureResponse('error')
    try {
      if (
        !(await deps.readEnabled(message.mode ?? 'rectangle')) ||
        !(await deps.hasPermission(origin))
      ) {
        return emptyLinkCaptureResponse('forbidden')
      }
      const excludePatterns = await deps.readExcludePatterns()
      const { links, excluded, duplicates } = selectLinks(
        message.links,
        excludePatterns,
      )
      const savedUrls = new Set(await deps.readSavedUrls())
      const existing = [...links.keys()].filter((url) =>
        savedUrls.has(url),
      ).length
      counts = {
        ...counts,
        excluded,
        duplicates,
        existing,
        newCount: links.size - existing,
      }
      if (
        message.action === 'previewLinkCapture' ||
        (links.size > LINK_CAPTURE_CONFIRM_THRESHOLD && !message.confirmed)
      ) {
        return {
          ...counts,
          status:
            links.size > LINK_CAPTURE_CONFIRM_THRESHOLD
              ? 'confirmation_required'
              : 'ok',
        }
      }
      const key = `${scope}:${message.requestId}`
      const fingerprint = JSON.stringify(message.links)
      const previous = completed.get(key)
      if (previous) {
        return previous.fingerprint === fingerprint
          ? previous.response
          : emptyLinkCaptureResponse('invalid_message')
      }
      if (links.size === 0) {
        return { ...counts, status: 'ok' }
      }
      const result = await deps.saveLinks([...links.values()])
      const response: LinkCaptureResponse = {
        ...counts,
        status: 'ok',
        saved: result.savedCount,
        newCount: result.savedCount,
        existing: result.existingCount,
      }
      completed.set(key, { fingerprint, response })
      // No durable token ledger is needed: atomic preserveExisting makes replays after worker restart harmless.
      if (completed.size > MAX_CACHED_CAPTURE_RESPONSES) {
        completed.delete(completed.keys().next().value ?? '')
      }
      return response
    } catch {
      return { ...counts, status: 'error', failed: counts.newCount }
    }
  }
  return async (
    message: LinkCaptureMessage,
    sender: unknown,
  ): Promise<LinkCaptureResponse> => {
    const result = pending.then(async () => handle(message, sender))
    pending = result
    return result
  }
}

export const handleLinkCaptureMessage = createLinkCaptureHandler({
  extensionId: () => browser.runtime.id,
  readEnabled: async (mode) => {
    const settings = await readLinkCaptureSettings()
    return mode === 'click' ? settings.clickEnabled : settings.enabled
  },
  hasPermission: async (origin) => {
    // Firefox match patterns cannot include ports. This feature requires the
    // broad HTTP(S) host grant, so a portless host query retains that policy.
    const url = new URL(origin)
    return browser.permissions.contains({
      permissions: ['scripting'],
      origins: [`${url.protocol}//${url.hostname}/*`],
    })
  },
  readExcludePatterns: async () =>
    (await requireUserSettings()).excludePatterns,
  readSavedUrls: async () =>
    (await getBackgroundSavedTabsDataPlane().readInsightRecords()).map(
      ({ url }) => url,
    ),
  saveLinks: async (links) => {
    const result = await getBackgroundSavedTabsDataPlane().saveTabs(links, {
      preserveExisting: true,
    })
    if (!result) {
      throw new Error('Capture requires atomic saved-link counts.')
    }
    return result
  },
})
