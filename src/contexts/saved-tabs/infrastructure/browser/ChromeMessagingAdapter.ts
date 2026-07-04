/**
 * `chrome.runtime.sendMessage` 依存を `MessagingPort` interface に
 * 適合させる adapter。
 *
 * `presentation` 層は `chrome.runtime.sendMessage` を直接参照できないため、
 * `composition` 層からこの adapter を `MessagingPort` として
 * presentation コンポーネント (issue #531 で対象としている
 * `ProjectUrlItem` / `SortableUrlItem`) へ注入する。
 *
 * port 境界では `chrome.runtime.sendMessage` の生 callback 受け取りを
 * `Promise<MessagingPortResponse | undefined>` に正規化し、port 利用側に
 * `chrome.*` 型を一切露出しない。`chrome` API が見つからない環境
 * (テスト / Storybook / SSR など) では `send` は即座に `undefined` を
 * 返し、UI 側の fire-and-forget 呼び出しが落とされないように no-op 化する。
 *
 * 内部では `chrome.runtime.lastError` を確認し、失敗時に握り潰して
 * `undefined` を返す。`MessagingPort` 仕様は「失敗を throw しない」
 * 方針のため、background 未起動や runtime エラーで use-case /
 * presentation 全体が落ちないようにする。
 *
 * @example
 * ```ts
 * const port: MessagingPort = createChromeMessagingAdapter()
 * await port.send({
 *   action: 'urlDragStarted',
 *   url: 'https://example.com',
 *   groupId: 'group-1',
 * })
 * ```
 */

import { CHROME_MESSAGING_ADAPTER_MARKER } from '@/contexts/saved-tabs/application/ports/MessagingPort'
import type {
  ExternalDragMessage,
  MessagingPort,
  MessagingPortResponse,
} from '@/contexts/saved-tabs/application/ports/MessagingPort'

export interface ChromeRuntimeSendMessageLike {
  /**
   * `chrome.runtime.sendMessage` 互換の最小 API。
   * callback 受け取りは port 側で `Promise` 化する。
   */
  readonly sendMessage?: (
    message: ExternalDragMessage,
    callback?: (response: MessagingPortResponse | undefined) => void,
  ) => void
}

export interface ChromeRuntimeLike {
  readonly sendMessage?: ChromeRuntimeSendMessageLike['sendMessage']
  readonly lastError?: { readonly message?: string } | undefined
}

export interface ChromeApiLike {
  readonly runtime?: ChromeRuntimeLike
}

export interface ChromeMessagingAdapterDeps {
  /**
   * `chrome.runtime` を含む chrome API 全体。テスト時は
   * `runtime.sendMessage` を持つモックオブジェクトを渡す。
   * 未指定なら `globalThis.chrome` を直接参照する。
   */
  readonly getApi?: () => ChromeApiLike | undefined
}

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null

const isChromeApiLike = (value: unknown): value is ChromeApiLike =>
  isObject(value)

/**
 * `chrome.runtime.sendMessage` を利用する `MessagingPort` 実装を生成する。
 *
 * `chrome` API が見つからない環境 (テスト / Storybook / SSR など) では
 * `send` は即座に `undefined` を返し、port 利用側 (UI コンポーネント) の
 * fire-and-forget 呼び出しが落とされないようにする。
 * もし背景通信の失敗を可視化したい場合は port 実装をモックで差し替え、
 * テスト時に `send` 呼び出しを検証する。
 */
export const createChromeMessagingAdapter = (
  deps: ChromeMessagingAdapterDeps = {},
): MessagingPort => {
  const resolveApi = (): ChromeApiLike | undefined => {
    if (deps.getApi) {
      return deps.getApi()
    }
    const chromeValue: unknown = Reflect.get(globalThis, 'chrome')
    return isChromeApiLike(chromeValue) ? chromeValue : undefined
  }
  return {
    [CHROME_MESSAGING_ADAPTER_MARKER]: true,
    send: async (message) => {
      const api = resolveApi()
      const sendMessage = api?.runtime?.sendMessage
      if (!sendMessage) {
        return undefined
      }
      return new Promise<MessagingPortResponse | undefined>((resolve) => {
        sendMessage(message, (response) => {
          const lastError = api.runtime?.lastError
          if (lastError) {
            console.warn(
              '[messaging] chrome.runtime.sendMessage でエラー:',
              lastError.message,
            )
            resolve(undefined)
            return
          }
          resolve(response)
        })
      })
    },
  }
}
