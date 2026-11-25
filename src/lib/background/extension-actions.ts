import { browser } from 'wxt/browser'

import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import {
  getBrowserUiLocale,
  getMessage,
  resolveLanguage,
} from '@/features/i18n/lib/language'
import type { AppLanguage, LanguageSetting } from '@/features/i18n/messages'
import {
  NativeSavedTabTitleCaptureError,
  normalizeSavedTabTitles,
} from '@/lib/browser/normalize-saved-tab-titles'
import { UserSettingsReadError } from '@/lib/storage/settings'
import { toSavableLinkUrl } from '@/lib/url-filter'

import type { CapturePlan, CaptureScope } from './capture-plan'
import { createCapturePlan, TabFilteringError } from './capture-plan'
import { getBackgroundLanguage } from './i18n'
import { showNotification } from './notification'
import { openSavedTabsPage } from './saved-tabs-page'
import { requireOperationalUserSettings } from './settings-policy'

type CaptureAction = Exclude<CaptureScope, 'selectedTabs'>
type CaptureResult = { url: string; title: string }[]

// Start the browser request now and observe failures even if the selected
// scope does not need this result.
const beginTabQuery = (request: Promise<chrome.tabs.Tab[]>) => {
  const outcome = Promise.allSettled([request])
  return async (): Promise<chrome.tabs.Tab[]> => {
    const [result] = await outcome
    if (result.status === 'rejected') {
      throw result.reason
    }
    return result.value
  }
}

const getAllTabsAcrossWindows = async (): Promise<chrome.tabs.Tab[]> => {
  const readFallback = beginTabQuery(browser.tabs.query({}))
  try {
    const windows = await browser.windows.getAll({ populate: true })
    const tabs = windows.flatMap((window) => window.tabs ?? [])
    if (tabs.length > 0) {
      return tabs
    }
  } catch (error) {
    console.warn(
      'windows.getAll で全タブ取得に失敗したため tabs.query にフォールバックします',
      error,
    )
  }

  return readFallback()
}

const queryCaptureTabs = async (
  action: CaptureAction,
): Promise<chrome.tabs.Tab[]> =>
  action === 'saveAllWindowsTabs'
    ? getAllTabsAcrossWindows()
    : browser.tabs.query({
        currentWindow: true,
        ...(action === 'saveCurrentTab' ? { active: true } : {}),
      })

const queryToolbarTabs = (clickedTab?: chrome.tabs.Tab) => {
  const readAllTabs = beginTabQuery(getAllTabsAcrossWindows())
  const readWindowTabs = beginTabQuery(
    browser.tabs.query(
      clickedTab ? { windowId: clickedTab.windowId } : { currentWindow: true },
    ),
  )
  return async (scope: CaptureAction): Promise<chrome.tabs.Tab[]> => {
    if (scope === 'saveAllWindowsTabs') {
      return readAllTabs()
    }
    const tabs = await readWindowTabs()
    return scope === 'saveCurrentTab'
      ? tabs.filter(({ id, active }) =>
          clickedTab ? id === clickedTab.id : active,
        )
      : tabs
  }
}

const resolveCaptureLanguage = (
  setting: LanguageSetting | undefined,
): AppLanguage => {
  if (setting && setting !== 'system') {
    return setting
  }
  try {
    return resolveLanguage('system', getBrowserUiLocale('ja'))
  } catch {
    return 'ja'
  }
}

const captureMessages: Record<CaptureAction, string> = {
  saveCurrentTab: 'background.saveTabs.currentTabSaved',
  saveSameDomainTabs: 'background.saveTabs.sameDomainSaved',
  saveWindowTabs: 'background.saveTabs.windowTabsSaved',
  saveAllWindowsTabs: 'background.saveTabs.allWindowsSaved',
}

const noneSavedMessageKeys = {
  'extension-page': 'background.saveTabs.noneSavedExtensionPage',
  pinned: 'background.saveTabs.noneSavedPinned',
  'url-policy': 'background.saveTabs.noneSavedUrlPolicy',
} as const

type SkippedReason = keyof typeof noneSavedMessageKeys

const skippedReasonPriority: readonly SkippedReason[] = [
  'url-policy',
  'pinned',
  'extension-page',
]

/**
 * 保存対象から外れたタブのうち、ユーザーが対処できる理由（ピン留め・
 * 拡張機能ページ・URLポリシー）だけを集計する。スコープ外は仕様どおりの
 * 除外なので通知には含めない。
 */
const summarizeSkippedTabs = (
  plan: CapturePlan,
): { count: number; primaryReason: SkippedReason } | undefined => {
  const counts = new Map<SkippedReason, number>()
  for (const { reason } of plan.excludedReasons) {
    if (reason === 'outside-scope') {
      continue
    }
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  const count = [...counts.values()].reduce((sum, value) => sum + value, 0)
  if (count === 0) {
    return undefined
  }
  const primaryReason = skippedReasonPriority.reduce<SkippedReason>(
    (best, reason) =>
      (counts.get(reason) ?? 0) > (counts.get(best) ?? 0) ? reason : best,
    'extension-page',
  )
  return { count, primaryReason }
}

const notifyNoneSaved = async (
  language: AppLanguage,
  messageKey: string,
): Promise<void> => {
  await showNotification(
    getMessage(language, 'background.saveTabs.noneSavedTitle'),
    getMessage(language, messageKey),
  )
}

const notifyCaptureError = async (
  language: AppLanguage,
  error: unknown,
): Promise<void> => {
  let prefix = 'background.saveTabs.captureError'
  if (error instanceof TabFilteringError) {
    prefix = 'background.saveTabs.filterError'
  } else if (error instanceof NativeSavedTabTitleCaptureError) {
    prefix = 'background.saveTabs.titleCaptureError'
  }
  await showNotification(
    getMessage(language, `${prefix}Title`),
    getMessage(language, `${prefix}Message`),
  )
}

const saveCaptureTabs = async (plan: CapturePlan) => {
  const tabs = await normalizeSavedTabTitles([...plan.includedTabs])
  const receipt = await getBackgroundSavedTabsDataPlane().saveTabs(
    tabs.map(({ title, ...tab }) => ({
      ...tab,
      ...(title !== undefined ? { title } : {}),
    })),
  )
  const savedUrls = new Set(
    receipt && 'savedUrls' in receipt ? receipt.savedUrls : [],
  )
  const savedTabs = tabs.filter(({ url }) => savedUrls.has(url))
  return {
    savedTabs,
    // savedUrls に含まれなかった対象タブ（無効URLなど）をタブ単位で数える。
    // savedTabs と同じ基準で、同一URLの複数タブも1タブずつ数える。
    unsavedCount: tabs.length - savedTabs.length,
  }
}

/**
 * 保存時にデータプレーンから漏れたタブ（無効URLなど）を、成功通知の
 * スキップ件数に含める。保存結果に現れないタブを通知から消さないため。
 */
const includeUnsavedTabsInSkipped = (
  skipped: ReturnType<typeof summarizeSkippedTabs>,
  unsavedCount: number,
): ReturnType<typeof summarizeSkippedTabs> => {
  if (unsavedCount === 0) {
    return skipped
  }
  return {
    count: (skipped?.count ?? 0) + unsavedCount,
    primaryReason: skipped?.primaryReason ?? 'url-policy',
  }
}

const closeCaptureTabs = async (
  plan: CapturePlan,
  savedTabs: Awaited<ReturnType<typeof saveCaptureTabs>>['savedTabs'],
  savedTabsPageId: number | undefined,
): Promise<void> => {
  const closeTargetIds = new Set(plan.closeTargetIds)
  await Promise.all(
    savedTabs.map(async ({ id, url }) => {
      if (
        id === undefined ||
        id === savedTabsPageId ||
        !closeTargetIds.delete(id)
      ) {
        return
      }
      // A source tab can disappear, navigate, or be pinned while saving.
      const current = await browser.tabs.get(id).catch(() => undefined)
      if (
        current?.id !== id ||
        current.pinned ||
        current.status === 'loading' ||
        current.url !== url ||
        (current.pendingUrl !== undefined && current.pendingUrl !== url)
      ) {
        return
      }
      try {
        await browser.tabs.remove(id)
      } catch (error) {
        console.error('タブを閉じる際にエラー:', error)
      }
    }),
  )
}

const runTabCapture = async (
  action?: CaptureAction,
  clickedTab?: chrome.tabs.Tab,
): Promise<CaptureResult> => {
  let language: AppLanguage = 'ja'
  try {
    // A toolbar click can select any scope. Start its browser snapshot before
    // waiting for storage so tabs created during that read stay out of capture.
    const readTabs = action
      ? beginTabQuery(queryCaptureTabs(action))
      : queryToolbarTabs(clickedTab)
    const settings = await requireOperationalUserSettings()
    language = resolveCaptureLanguage(settings.language)
    const scope = action ?? settings.clickBehavior
    const plan = createCapturePlan(
      scope,
      await readTabs(scope),
      settings,
      clickedTab ? { sameDomainAnchor: clickedTab } : undefined,
    )
    const skipped = summarizeSkippedTabs(plan)
    if (plan.includedTabs.length === 0) {
      if (skipped) {
        await notifyNoneSaved(
          language,
          noneSavedMessageKeys[skipped.primaryReason],
        )
      }
      return []
    }

    const { savedTabs, unsavedCount } = await saveCaptureTabs(plan)
    if (savedTabs.length === 0) {
      await notifyNoneSaved(language, 'background.saveTabs.noneSavedUrlPolicy')
      return []
    }
    const savedTabsPageId =
      scope === 'saveAllWindowsTabs' || scope === 'saveWindowTabs'
        ? await openSavedTabsPage({ closeDuplicates: false })
        : undefined
    const savedMessage = getMessage(
      language,
      captureMessages[scope],
      undefined,
      {
        count: String(savedTabs.length),
        domain: plan.hostname ?? '',
      },
    )
    const effectiveSkipped = includeUnsavedTabsInSkipped(skipped, unsavedCount)
    await showNotification(
      getMessage(language, 'background.saveTabs.notificationTitle'),
      effectiveSkipped
        ? `${savedMessage}\n${getMessage(language, 'background.saveTabs.skippedSummary', undefined, { count: String(effectiveSkipped.count) })}`
        : savedMessage,
    )
    if (savedTabsPageId !== null) {
      await closeCaptureTabs(plan, savedTabs, savedTabsPageId)
    }
    return savedTabs.map(({ title, url }) => ({
      title: title ?? '',
      url: url.trim(),
    }))
  } catch (error) {
    if (!(error instanceof UserSettingsReadError)) {
      await notifyCaptureError(language, error)
    }
    throw error
  }
}

export const handleExtensionActionClick = async (
  tab?: chrome.tabs.Tab,
): Promise<void> => {
  try {
    await runTabCapture(undefined, tab)
  } catch (error: unknown) {
    console.error(
      'エラーが発生しました:',
      error instanceof Error ? error.message : error,
    )
  }
}

/**
 * リンク先の初期タイトルは、未訪問ページへアクセスせずURLから生成する。
 */
const deriveLinkTitle = (url: string): string => {
  const parsedUrl = new URL(url)
  const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname
  return `${parsedUrl.host}${path}${parsedUrl.search}`
}

const showLinkNotification = async (
  titleKey: string,
  messageKey: string,
): Promise<void> => {
  const language = await getBackgroundLanguage({ repairStoredSettings: false })
  await showNotification(
    getMessage(language, titleKey),
    getMessage(language, messageKey),
  )
}

/**
 * 右クリックされたリンク先だけを保存する。ページは開かず、タブも閉じない。
 */
export const handleSaveLink = async (
  linkUrl: string | undefined,
): Promise<
  {
    url: string
    title: string
  }[]
> => {
  const settings = await requireOperationalUserSettings()
  const url = toSavableLinkUrl(linkUrl, settings.excludePatterns)
  if (!url) {
    await showLinkNotification(
      'background.saveTabs.linkNotSavableTitle',
      'background.saveTabs.linkNotSavable',
    )
    return []
  }

  const title = deriveLinkTitle(url)
  try {
    // Duplicate saves refresh the existing record; its edited title wins.
    await getBackgroundSavedTabsDataPlane().saveTabs([{ title, url }], {
      preserveExistingTitle: true,
    })
  } catch (error) {
    await showLinkNotification(
      'background.saveTabs.linkSaveFailedTitle',
      'background.saveTabs.linkSaveFailed',
    )
    throw error
  }

  await showLinkNotification(
    'background.saveTabs.linkSavedTitle',
    'background.saveTabs.linkSaved',
  )
  return [{ title, url }]
}
export const handleSaveCurrentTab = async (): Promise<CaptureResult> =>
  runTabCapture('saveCurrentTab')

export const handleSaveSameDomainTabs = async (): Promise<CaptureResult> =>
  runTabCapture('saveSameDomainTabs')

export const handleSaveAllWindowsTabs = async (): Promise<CaptureResult> =>
  runTabCapture('saveAllWindowsTabs')

export const handleSaveWindowTabs = async (): Promise<CaptureResult> =>
  runTabCapture('saveWindowTabs')
