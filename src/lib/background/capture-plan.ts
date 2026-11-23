import { filterItemsBySavableUrl } from '@/lib/url-filter'
import type { UserSettings } from '@/types/storage'

export type CaptureScope = UserSettings['clickBehavior'] | 'selectedTabs'

type CapturePolicy = {
  readonly excludePinnedTabs: boolean
  readonly excludePatterns: readonly string[]
}

type CapturedTab = Readonly<chrome.tabs.Tab & { url: string }>
type ExclusionReason =
  | 'outside-scope'
  | 'pinned'
  | 'extension-page'
  | 'url-policy'

export type CapturePlan = Readonly<{
  scope: CaptureScope
  hostname: string | undefined
  sourceTabIds: readonly number[]
  includedTabIds: readonly number[]
  includedTabs: readonly CapturedTab[]
  excludedReasons: readonly Readonly<{
    tabId: number | undefined
    reason: ExclusionReason
  }>[]
  settingsPolicy: CapturePolicy
  closeTargetIds: readonly number[]
}>

export class TabFilteringError extends Error {
  public readonly reason: 'invalid-exclude-patterns' | 'evaluation-failed'

  public constructor(reason: 'invalid-exclude-patterns' | 'evaluation-failed') {
    super('Tab filtering could not be completed.')
    this.name = 'TabFilteringError'
    this.reason = reason
  }
}

const isTabId = (id: number | undefined): id is number =>
  id !== undefined && Number.isSafeInteger(id) && id >= 0

const isExtensionUrl = (url: string | undefined): boolean =>
  /^(?:chrome|moz)-extension:/i.test(url?.trim() ?? '')

const getHostname = (url: string | undefined): string | undefined => {
  try {
    return url && !isExtensionUrl(url) ? new URL(url).hostname : undefined
  } catch {
    return undefined
  }
}

const tabIds = (tabs: readonly chrome.tabs.Tab[]): readonly number[] =>
  Object.freeze(tabs.map((tab) => tab.id).filter(isTabId))

const snapshotCapturePolicy = (settings: CapturePolicy): CapturePolicy => {
  if (
    !Array.isArray(settings.excludePatterns) ||
    !settings.excludePatterns.every((pattern) => typeof pattern === 'string')
  ) {
    throw new TabFilteringError('invalid-exclude-patterns')
  }
  return Object.freeze({
    excludePinnedTabs: settings.excludePinnedTabs,
    excludePatterns: Object.freeze([...settings.excludePatterns]),
  })
}

const getExclusionReason = (
  tab: chrome.tabs.Tab,
  inScope: boolean,
  excludePinnedTabs: boolean,
  urlAllowed: boolean,
): ExclusionReason | undefined => {
  if (!inScope) {
    return 'outside-scope'
  }
  if (isExtensionUrl(tab.pendingUrl) || isExtensionUrl(tab.url)) {
    return 'extension-page'
  }
  if (excludePinnedTabs && tab.pinned) {
    return 'pinned'
  }
  return urlAllowed ? undefined : 'url-policy'
}

/**
 * The caller supplies a single browser snapshot for the requested scope.
 * Selected-tab capture supplies only its highlighted tabs. Save-only capture
 * can use the same scope and set closeAfterSave to false.
 */
export const createCapturePlan = (
  scope: CaptureScope,
  tabs: readonly chrome.tabs.Tab[],
  settings: CapturePolicy,
  closeAfterSave = true,
): CapturePlan => {
  try {
    const settingsPolicy = snapshotCapturePolicy(settings)
    const hostname =
      scope === 'saveSameDomainTabs'
        ? getHostname(tabs.find((tab) => tab.active)?.url)
        : undefined
    const savableUrls = new Set(
      filterItemsBySavableUrl([...tabs], settingsPolicy.excludePatterns),
    )
    const includedTabs: CapturedTab[] = []
    const excludedReasons: CapturePlan['excludedReasons'][number][] = []

    for (const [index, tab] of tabs.entries()) {
      const inScope =
        (scope !== 'saveCurrentTab' || index === 0) &&
        (scope !== 'saveSameDomainTabs' ||
          (hostname !== undefined && getHostname(tab.url) === hostname))
      const reason = getExclusionReason(
        tab,
        inScope,
        settingsPolicy.excludePinnedTabs,
        savableUrls.has(tab),
      )
      if (reason !== undefined || tab.url === undefined) {
        excludedReasons.push(
          Object.freeze({ tabId: tab.id, reason: reason ?? 'url-policy' }),
        )
      } else {
        includedTabs.push(Object.freeze({ ...tab, url: tab.url }))
      }
    }

    return Object.freeze({
      scope,
      hostname,
      settingsPolicy,
      sourceTabIds: tabIds(tabs),
      includedTabIds: tabIds(includedTabs),
      includedTabs: Object.freeze(includedTabs),
      excludedReasons: Object.freeze(excludedReasons),
      closeTargetIds: tabIds(
        closeAfterSave ? includedTabs.filter((tab) => !tab.pinned) : [],
      ),
    })
  } catch (error) {
    throw error instanceof TabFilteringError
      ? error
      : new TabFilteringError('evaluation-failed')
  }
}
