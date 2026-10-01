/**
 * Chrome Storage の userSettings 変更を検証して presentation へ通知する。
 * ドメインデータの変更通知は IndexedDB の post-commit transport が所有する。
 */

import type { z } from 'zod'

import { CHROME_STORAGE_CHANGE_ADAPTER_MARKER } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type {
  StorageChangePort,
  TypedSavedTabsStorageChange,
} from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import { USER_SETTINGS_KEY } from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUserSettingsStorage'
import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'
import { getChromeStorageOnChanged } from '@/lib/browser/chrome-storage'
import { UserSettingsSchema } from '@/lib/storage/zod-storage'

export type ChromeStorageOnChangedLike = {
  readonly addListener: (callback: ChromeOnChangedListener) => void
  readonly removeListener: (callback: ChromeOnChangedListener) => void
}

export type ChromeStorageLike = {
  readonly onChanged?: ChromeStorageOnChangedLike
}

export type ChromeApiLike = {
  readonly storage?: ChromeStorageLike
}

export type ChromeStorageChangeAdapterDeps = {
  /**
   * `chrome.storage.onChanged` を含む chrome API 全体。テスト時は
   * `storage.onChanged.addListener` / `removeListener` を持つ
   * モックオブジェクトを渡す。未指定なら `getChromeStorageOnChanged`
   * 経由で実 `chrome` グローバルを参照する。
   */
  readonly getApi?: () => ChromeApiLike | undefined
  /**
   * `chrome.storage.onChanged` 相当の API を直接注入したい場合用。
   * `getApi` より優先される（Storybook などで `chrome` の一部だけを
   * 差し込みたい場合を想定）。
   */
  readonly getOnChanged?: () => ChromeStorageOnChangedLike | null
}

export type ChromeStorageChangeAdapterOptions = {
  /**
   * 購読対象とする storage エリア名。`chrome.storage.onChanged` は
   * グローバルに発火するため、port 側で areaName を絞り込む。
   * saved-tabs は `local` のみを使う前提でデフォルト 'local'。
   * `chrome.storage.sync` を併用する extension では `'sync'` を渡す。
   */
  readonly areaName?: 'local' | 'sync' | 'managed' | 'session'
}

const PartialUserSettingsRawSchema = UserSettingsSchema.partial()
type ParsedUserSettingsPayload = z.output<typeof PartialUserSettingsRawSchema>
type UserSettingsPayload = Extract<
  TypedSavedTabsStorageChange,
  { readonly key: 'userSettings' }
>['payload'][number]

const toUserSettingsPresentationPayload = (
  settings: ParsedUserSettingsPayload,
): UserSettingsPayload => ({
  ...(settings.activeAiSystemPromptId !== undefined
    ? { activeAiSystemPromptId: settings.activeAiSystemPromptId }
    : {}),
  ...(settings.aiSystemPrompts !== undefined
    ? { aiSystemPrompts: settings.aiSystemPrompts }
    : {}),
  ...(settings.autoDeletePeriod !== undefined
    ? { autoDeletePeriod: settings.autoDeletePeriod }
    : {}),
  ...(settings.clickBehavior !== undefined
    ? { clickBehavior: settings.clickBehavior }
    : {}),
  ...(settings.colors !== undefined ? { colors: settings.colors } : {}),
  ...(settings.fontSizePercent !== undefined
    ? { fontSizePercent: settings.fontSizePercent }
    : {}),
  ...(settings.language !== undefined ? { language: settings.language } : {}),
  ...(settings.ollamaModel !== undefined
    ? { ollamaModel: settings.ollamaModel }
    : {}),
})

const toUserSettingsBehaviorPayload = (
  settings: ParsedUserSettingsPayload,
): UserSettingsPayload => ({
  ...(settings.confirmDeleteAll !== undefined
    ? { confirmDeleteAll: settings.confirmDeleteAll }
    : {}),
  ...(settings.confirmDeleteEach !== undefined
    ? { confirmDeleteEach: settings.confirmDeleteEach }
    : {}),
  ...(settings.enableCategories !== undefined
    ? { enableCategories: settings.enableCategories }
    : {}),
  ...(settings.excludePatterns !== undefined
    ? { excludePatterns: settings.excludePatterns }
    : {}),
  ...(settings.excludePinnedTabs !== undefined
    ? { excludePinnedTabs: settings.excludePinnedTabs }
    : {}),
  ...(settings.openAllInNewWindow !== undefined
    ? { openAllInNewWindow: settings.openAllInNewWindow }
    : {}),
  ...(settings.openUrlInBackground !== undefined
    ? { openUrlInBackground: settings.openUrlInBackground }
    : {}),
  ...(settings.removeTabAfterExternalDrop !== undefined
    ? { removeTabAfterExternalDrop: settings.removeTabAfterExternalDrop }
    : {}),
  ...(settings.removeTabAfterOpen !== undefined
    ? { removeTabAfterOpen: settings.removeTabAfterOpen }
    : {}),
  ...(settings.showSavedTime !== undefined
    ? { showSavedTime: settings.showSavedTime }
    : {}),
})

const toUserSettingsPayload = (
  settings: ParsedUserSettingsPayload,
): UserSettingsPayload => ({
  ...toUserSettingsPresentationPayload(settings),
  ...toUserSettingsBehaviorPayload(settings),
})

/**
 * `userSettings` は partial 適用が許されているため、`unknown` 値を
 * `Partial<UserSettings>` 相当にパースし、失敗時は空 payload を返す。
 */
const parseUserSettingsPayload = (value: unknown): UserSettingsPayload[] => {
  const parsed = PartialUserSettingsRawSchema.safeParse(value)
  if (!parsed.success) {
    return []
  }
  return [toUserSettingsPayload(parsed.data)]
}

/**
 * `chrome.storage.onChanged` を利用する `StorageChangePort` 実装を生成する。
 *
 * `chrome` API が見つからない環境（テスト / Storybook など）では
 * `subscribe` の戻り値が no-op となり、listener は発火しない。
 * これは「storage 変更を契機とする UI 同期は止めても use-case 全体は
 * 落とさない」という presentation 側の運用のため。
 * もし失敗を可視化したい場合は port 実装をモックで差し替え、
 * テスト時に listener 呼び出しを検証する。
 */
export const createChromeStorageChangeAdapter = (
  deps: ChromeStorageChangeAdapterDeps = {},
  options: ChromeStorageChangeAdapterOptions = {},
): StorageChangePort => {
  const areaName = options.areaName ?? 'local'

  const resolveOnChanged = (): ChromeStorageOnChangedLike | null => {
    if (deps.getOnChanged) {
      return deps.getOnChanged()
    }
    if (deps.getApi) {
      return deps.getApi()?.storage?.onChanged ?? null
    }
    return getChromeStorageOnChanged()
  }

  return {
    [CHROME_STORAGE_CHANGE_ADAPTER_MARKER]: true,
    subscribe: (listener) => {
      const onChanged = resolveOnChanged()
      if (!onChanged) {
        return () => {}
      }
      const wrappedListener: ChromeOnChangedListener = (changes, area) => {
        if (area !== areaName) {
          return
        }
        const change = changes[USER_SETTINGS_KEY]
        if (!change) {
          return
        }
        listener([
          {
            key: USER_SETTINGS_KEY,
            kind: 'parsed',
            oldValue: change.oldValue,
            payload: parseUserSettingsPayload(change.newValue),
          },
        ])
      }
      onChanged.addListener(wrappedListener)
      return () => {
        onChanged.removeListener(wrappedListener)
      }
    },
  }
}
