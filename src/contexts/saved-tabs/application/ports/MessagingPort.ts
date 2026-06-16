/**
 * `chrome.runtime.sendMessage` 相当の background 通信を抽象化する port。
 *
 * presentation / application 層は `chrome.*` API を直接呼ばず、本 port 経由で
 * `BackgroundMessage` (typed envelope) を background script へ通知する。
 * infrastructure 層が `ChromeMessagingAdapter` で本 port を実装し、
 * composition 層 (`createSavedTabsUseCasesDeps`) から use-case および
 * presentation コンポーネントへ注入する。
 *
 * port 境界では `chrome.runtime.sendMessage` の生 payload を
 * `BackgroundMessage` (issue #531) の DTO に正規化し、port 利用側に
 * `chrome.*` 型を一切露出しない。これにより presentation 層の
 * `ProjectUrlItem` / `SortableUrlItem` などの component は
 * `chrome.runtime.sendMessage` を直叩きせず、port 経由のみで
 * 外部ウィンドウへのドラッグ&ドロップ通知 (`urlDragStarted` / `urlDropped`)
 * を行える。
 *
 * port 設計は「送る payload は typed envelope、レスポンスは受け取り側で
 * 関心があるフィールドだけ」の最小 interface に絞り、port 利用者
 * (UI コンポーネント) が `chrome.runtime.MessageSender` 相当の sender や
 * 拡張機能固有の概念に依存しない形にする。
 *
 * レスポンス (`response`) は `chrome.runtime.sendMessage` と同じく
 * 任意受け取りで、未指定時は ack を待たない fire-and-forget として扱う。
 * port 実装側 (`ChromeMessagingAdapter`) は `chrome.runtime.lastError`
 * などがあれば握り潰し、ログだけ残す方針とする。
 *
 * @example
 * ```ts
 * const port: MessagingPort = createChromeMessagingAdapter()
 * port.send({
 *   action: 'urlDragStarted',
 *   url: 'https://example.com',
 *   groupId: 'group-1',
 * })
 * ```
 */

import type {
  UrlDragStartedMessage,
  UrlDroppedMessage,
} from '@/types/background'

/**
 * port 経由で送れる background メッセージ (typed envelope)。
 *
 * issue #531 で対象としている `urlDragStarted` / `urlDropped` を中心に、
 * 今後 presentation 層から background へ通知したくなるメッセージを
 * discriminated union として拡張していく。
 * レスポンス受信を port 利用側が意識しなくて良いよう、各 action は
 * `UrlDragStartedMessage` / `UrlDroppedMessage` の interface を
 * そのまま共有する (`action` discriminant で switch 絞り込み可能)。
 */
export type ExternalDragMessage = UrlDragStartedMessage | UrlDroppedMessage

/**
 * port 経由で受け取る background レスポンスの最小 DTO。
 *
 * 現状は background handler (`message-handler.ts`) が返す
 * `StatusResponse` のうち、presentation 層が利用するのは
 * `status` / `success` 程度だが、port 境界では
 * `unknown` まで公開せず、型ナローイングできる最小限のフィールドに
 * 留める。`removedCount` / `error` などを必要になった時点で
 * discriminated union として拡張する。
 */
export interface MessagingPortResponse {
  readonly status: string
  readonly success?: boolean
}

/**
 * background 通信 port の最小 interface。
 *
 * `send` は `chrome.runtime.sendMessage` の fire-and-forget / callback
 * 受け取りを 1 つの Promise ベース API に正規化したもの。
 * port 実装 (`ChromeMessagingAdapter`) は `chrome` が見つからない
 * 環境では no-op として ack を待ち、use-case / presentation 層が
 * background 未注入環境 (Storybook / SSR / 一部テスト) でも落ちない
 * ようにする。`getApi` が undefined を返した environment では
 * 早期 return で `undefined` を返す。
 */
export interface MessagingPort {
  /**
   * `chrome` 由来の port 実装に付くマーカー。
   *
   * `SavedTabsPage` などの composition 層が「chrome 由来の port であるか」
   * を識別し、テスト / SSR 用途の独自 port 実装を区別するために使う。
   * 任意実装の port では undefined か false を入れて良い。
   */
  readonly [CHROME_MESSAGING_ADAPTER_MARKER]?: boolean
  /**
   * background script へ typed envelope を送信する。
   *
   * `message` には `ExternalDragMessage` (現状は `urlDragStarted` /
   * `urlDropped`) のいずれかを渡す。`urlDropped` の `fromExternal`
   * フラグなど、envelope 内の optional フィールドは port 利用側が
   * 組み立てる責務 (presentation 層が UI の D&D 状態を見て判断する)。
   *
   * 返り値は background handler からのレスポンスを
   * `MessagingPortResponse` までナローイングした値。
   * handler が `sendResponse` を呼ばない、または
   * `chrome.runtime.lastError` が発生した場合は `undefined` を返す。
   * port 利用側はレスポンス未到着を許容できるよう、await しない
   * fire-and-forget 呼び出し (`void port.send(...)`) を基本とする。
   */
  send: (
    message: ExternalDragMessage,
  ) => Promise<MessagingPortResponse | undefined>
}

/**
 * `createChromeMessagingAdapter` が生成した port に付くマーカー symbol。
 *
 * port interface のプロパティキーとして export し、adapter 実装と
 * composition 層が同じ symbol を共有できるようにする。
 * `CHROME_BROWSER_TAB_ADAPTER_MARKER` / `CHROME_STORAGE_CHANGE_ADAPTER_MARKER`
 * と同じ運用方針。
 */
export const CHROME_MESSAGING_ADAPTER_MARKER = Symbol.for(
  'tabbin.chromeMessagingAdapter',
)
