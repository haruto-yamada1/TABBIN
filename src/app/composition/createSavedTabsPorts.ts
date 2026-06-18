import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '@/contexts/saved-tabs/application/ports/BrowserWindowPort'
import type { MessagingPort } from '@/contexts/saved-tabs/application/ports/MessagingPort'
import type { NotificationPort } from '@/contexts/saved-tabs/application/ports/NotificationPort'
import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import { createChromeBrowserTabAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import type { ChromeApiLike } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import { createChromeBrowserWindowAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserWindowAdapter'
import { createChromeMessagingAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter'
import type { ChromeApiLike as ChromeMessagingApiLike } from '@/contexts/saved-tabs/infrastructure/browser/ChromeMessagingAdapter'
import { createChromeStorageChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeStorageChangeAdapter'
import { createSonnerNotificationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter'
import { getChromeGlobal } from '@/lib/browser/chrome-global'

/**
 * `src/app/composition/` レベルで組み立てる、saved-tabs 用
 * `Port` 実装のバンドル。
 *
 * `BrowserTabPort` は `chrome.tabs` をラップした `ChromeBrowserTabAdapter`、
 * `BrowserWindowPort` は `chrome.windows` をラップした `ChromeBrowserWindowAdapter`、
 * `NotificationPort` は `sonner` の `toast` をラップした
 * `SonnerNotificationAdapter` で実装する。`application/ports/` の
 * interface を満たすため、use-case 側からは adapter の詳細を隠せる。
 */
export interface SavedTabsPorts {
  readonly browserTabPort: BrowserTabPort
  readonly browserWindowPort: BrowserWindowPort
  readonly notificationPort: NotificationPort
  readonly storageChangePort: StorageChangePort
  /**
   * background 通信 port (issue #531)。
   * presentation 層 (`ProjectUrlItem` / `SortableUrlItem`) の
   * 外部ウィンドウ D&D 通知を `chrome.runtime.sendMessage` 直叩きせず
   * port 経由で行うため、ports 経由で配下に注入する。
   */
  readonly messagingPort: MessagingPort
}

/**
 * `createSavedTabsPorts` に渡せる任意設定。
 *
 * `resolveActive` は presentation 層が `openUrlInBackground` 設定をランタイムで
 * 反映するための関数。`true` を返すと新規タブを active で開き、`false` を返すと
 * バックグラウンド (`active: false`) で開く。未指定なら `active: true` 既定。
 */
export interface CreateSavedTabsPortsOptions {
  readonly resolveActive?: () => boolean
}

interface ChromeApi extends ChromeApiLike {
  readonly tabs?: ChromeApiLike['tabs'] & {
    readonly create?: NonNullable<NonNullable<ChromeApiLike['tabs']>['create']>
  }
  readonly windows?: {
    readonly create?: (createProperties: {
      readonly focused?: boolean
      readonly url?: readonly string[] | string
    }) =>
      | Promise<
          { readonly tabs?: readonly { readonly url?: string }[] } | undefined
        >
      | undefined
  }
  readonly runtime?: {
    readonly sendMessage?: (
      message: unknown,
      callback?: (response: unknown) => void,
    ) => void
    readonly lastError?: { readonly message?: string } | undefined
  }
  readonly storage?: {
    readonly onChanged?: {
      readonly addListener: (callback: ChromeOnChangedListener) => void
      readonly removeListener: (callback: ChromeOnChangedListener) => void
    }
  }
}

type ChromeOnChangedListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void

const getChromeApi = (): ChromeApi | undefined => getChromeGlobal<ChromeApi>()

/**
 * saved-tabs 用 port 実装を生成する。
 *
 * `chrome` グローバルが利用できない環境（Storybook / SSR など）では
 * `BrowserTabPort.open` / `BrowserWindowPort.openWithUrls` を
 * 呼び出した瞬間に `Error` が投げられる。
 * `NotificationPort` は `sonner.toast` が無い場合に
 * `console.warn` / `console.error` にフォールバックするため、通知で
 * use-case 全体を落とさない。
 *
 * `options.resolveActive` を渡すと、presentation 層が `openUrlInBackground`
 * 設定をランタイムで反映できる。指定しなければ `active: true` で開く。
 *
 * @example
 * ```ts
 * const ports = createSavedTabsPorts({
 *   resolveActive: () => !settings.openUrlInBackground,
 * })
 * const opened = await ports.browserTabPort.open({ url: 'https://example.com' })
 * ports.notificationPort.info({ message: '開きました' })
 * ```
 */
export const createSavedTabsPorts = (
  options: CreateSavedTabsPortsOptions = {},
): SavedTabsPorts => ({
  browserTabPort: createChromeBrowserTabAdapter(
    { getApi: () => getChromeApi() },
    options.resolveActive ? { resolveActive: options.resolveActive } : {},
  ),
  browserWindowPort: createChromeBrowserWindowAdapter({
    getApi: () => getChromeApi(),
  }),
  messagingPort: createChromeMessagingAdapter({
    // `getChromeApi()` の戻り値 `ChromeApi` は `BrowserTabPort` 由来の
    // `ChromeApiLike` (`{ tabs?: ... }`) に対し `runtime` / `storage` を
    // 追加で持つ拡張型。`createChromeMessagingAdapter` は
    // 拡張後の `ChromeApiLike` (`{ runtime?: ... }`) を要求するため、
    // `ChromeMessagingApiLike` への構造的部分型キャストで境界を超える。
    getApi: () => {
      // eslint-disable-next-line typescript/no-unsafe-type-assertion
      return getChromeApi() as unknown as ChromeMessagingApiLike | undefined
    },
  }),
  notificationPort: createSonnerNotificationAdapter(),
  storageChangePort: createChromeStorageChangeAdapter({
    getApi: () => getChromeApi(),
  }),
})
