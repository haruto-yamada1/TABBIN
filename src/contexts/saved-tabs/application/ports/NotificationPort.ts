/**
 * toast / 通知 UI を抽象化する port。
 *
 * use-case はユーザーへの通知を `chrome.notifications` や `sonner` などの
 * 特定技術に直接依存せず、本 port 経由で発火する。infrastructure 層が
 * 実際の UI 部品（例: `SonnerNotificationAdapter`）を実装する。
 *
 * `onClick` 内で副作用（Undo 復元など）を起こすケースがあるため、`action`
 * を受け取った実装は内部でハンドラーを保持し、クリック時にそれを実行する
 * こと。use-case 側は port に「副作用を持つ通知オブジェクト」を渡すだけの
 * 純粋なデータフローに閉じる。
 *
 * @example
 * ```ts
 * const port: NotificationPort = createSonnerNotificationAdapter()
 * port.info({
 *   message: '1 件削除しました',
 *   action: { label: '元に戻す', onClick: () => restore() },
 * })
 * ```
 */
export type NotificationAction = {
  readonly label: string
  /**
   * ユーザーが通知の action をクリックしたときに呼ばれる副作用。
   * 失敗時の挙動は port 実装側の責務（toast を消す、エラートーストを出す等）。
   */
  readonly onClick: () => void | Promise<void>
}

export type NotificationMessage = {
  readonly message: string
  readonly action?: NotificationAction
}

/**
 * 通知 port の最小インターフェース。
 *
 * 失敗通知は `error`、ユーザー操作の結果通知は `info` / `success` として
 * 分ける。port 実装が `success` を `info` に丸めても問題ないが、info を
 * success に昇格させないこと（呼び出し側の意図が変わる）。
 */
export type NotificationPort = {
  info: (input: NotificationMessage) => void
  success: (input: NotificationMessage) => void
  error: (input: NotificationMessage) => void
}
