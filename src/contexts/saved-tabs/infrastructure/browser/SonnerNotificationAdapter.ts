import { toast } from 'sonner'

import type {
  NotificationMessage,
  NotificationPort,
} from '@/contexts/saved-tabs/application/ports/NotificationPort'

/**
 * `sonner` の `toast` を `NotificationPort` interface に適合させる adapter。
 *
 * `info` / `success` / `error` の 3 種を `toast.info` / `toast.success` /
 * `toast.error` に対応付ける。`action` を含む場合は `action` ボタンを
 * 通知に紐付ける。Undo 復元など、ポート利用者（use-case / controller）が
 * 任意で渡せる構造を維持する。
 *
 * `sonner` が見つからない / toast が利用できない環境では
 * `console.warn` にフォールバックする。port 仕様は「失敗を throw しない」
 * 方針のため、UI 通知の失敗で use-case 全体が落ちないようにする。
 */
export interface SonnerNotificationAdapterDeps {
  /**
   * テストや差し替えで `toast` 自体をモックしたい場合に注入する。
   * 未指定なら `sonner` から `toast` を直接 import したものを使う。
   */
  readonly toastOverride?: Partial<
    Pick<typeof toast, 'info' | 'success' | 'error'>
  >
}

const resolveToast = (
  override?: SonnerNotificationAdapterDeps['toastOverride'],
) => override ?? toast

const toSonnerAction = (
  action: NotificationMessage['action'],
): { label: string; onClick: () => void } | undefined => {
  if (!action) {
    return undefined
  }
  return {
    label: action.label,
    onClick: () => {
      // port 仕様: 失敗時挙動は port 実装側の責務。void Promise を fire-and-forget。
      // 同期 throw は `try / catch` で吸収し、reject / async throw は `.catch` で吸収する。
      try {
        const result = action.onClick()
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          void (result as Promise<unknown>).catch((error: unknown) => {
            console.error('NotificationPort action onClick で失敗:', error)
          })
        }
      } catch (error) {
        console.error('NotificationPort action onClick で失敗:', error)
      }
    },
  }
}

const fallback = (level: 'info' | 'success' | 'error', message: string) => {
  if (level === 'error') {
    console.error(message)
  } else {
    console.warn(message)
  }
}

/**
 * `sonner.toast` を利用する `NotificationPort` 実装を生成する。
 *
 * `toast` が `undefined`（テストで意図的に取り除いたケースなど）の場合は
 * `console.warn` / `console.error` にフォールバックする。
 */
export const createSonnerNotificationAdapter = (
  deps: SonnerNotificationAdapterDeps = {},
) => {
  const notify =
    (level: 'info' | 'success' | 'error') => (input: NotificationMessage) => {
      const t = resolveToast(deps.toastOverride)
      const action = toSonnerAction(input.action)
      if (!t[level]) {
        fallback(level, input.message)
        return
      }
      if (action) {
        t[level](input.message, { action })
        return
      }
      t[level](input.message)
    }
  const port: NotificationPort = {
    error: notify('error'),
    info: notify('info'),
    success: notify('success'),
  }
  return port
}
