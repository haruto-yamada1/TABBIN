import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import type { NotificationPort } from '@/contexts/saved-tabs/application/ports/NotificationPort'
import { createChromeBrowserTabAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import type { ChromeApiLike } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import { createSonnerNotificationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter'

/**
 * `src/app/composition/` レベルで組み立てる、saved-tabs 用
 * `Port` 実装のバンドル。
 *
 * `BrowserTabPort` は `chrome.tabs` をラップした `ChromeBrowserTabAdapter`、
 * `NotificationPort` は `sonner` の `toast` をラップした
 * `SonnerNotificationAdapter` で実装する。`application/ports/` の
 * interface を満たすため、use-case 側からは adapter の詳細を隠せる。
 */
export interface SavedTabsPorts {
  readonly browserTabPort: BrowserTabPort
  readonly notificationPort: NotificationPort
}

interface ChromeApi extends ChromeApiLike {
  readonly tabs?: ChromeApiLike['tabs'] & {
    readonly create?: NonNullable<NonNullable<ChromeApiLike['tabs']>['create']>
  }
}

const getChromeApi = (): ChromeApi | undefined =>
  (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome

/**
 * saved-tabs 用 port 実装を生成する。
 *
 * `chrome` グローバルが利用できない環境（Storybook / SSR など）では
 * `BrowserTabPort.open` を呼び出した瞬間に `Error` が投げられる。
 * `NotificationPort` は `sonner.toast` が無い場合に
 * `console.warn` / `console.error` にフォールバックするため、通知で
 * use-case 全体を落とさない。
 *
 * @example
 * ```ts
 * const ports = createSavedTabsPorts()
 * const opened = await ports.browserTabPort.open({ url: 'https://example.com' })
 * ports.notificationPort.info({ message: '開きました' })
 * ```
 */
export const createSavedTabsPorts = (): SavedTabsPorts => ({
  browserTabPort: createChromeBrowserTabAdapter({
    getApi: () => getChromeApi(),
  }),
  notificationPort: createSonnerNotificationAdapter(),
})
