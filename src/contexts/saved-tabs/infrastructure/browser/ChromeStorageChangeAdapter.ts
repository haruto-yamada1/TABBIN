/**
 * `chrome.storage.onChanged` 依存を `StorageChangePort` interface に
 * 適合させる adapter。
 *
 * `presentation` 層は `chrome.storage.onChanged` を直接購読できないため、
 * `composition` 層からこの adapter を `StorageChangePort` として
 * 注入する。`chrome` API が見つからない環境（テスト / Storybook /
 * SSR など）では `subscribe` の返り値を呼んでも何もしない
 * no-op 関数として扱い、use-case / presentation 側の後段処理を
 * 落とさない方針とする（`chrome.tabs` 等の他 adapter とは挙動が
 * 異なる点に注意）。
 *
 * port 境界では `chrome.storage.StorageChange` を `{ key, oldValue,
 * newValue }` の DTO に詰め替え、port 利用側に `chrome.*` 型を
 * 一切露出しない。storage エリア名 (`local` / `sync` 等) は
 * `options.areaName` で絞り込み、saved-tabs は `local` のみを
 * 対象とする既定とする。
 *
 * 加えて、issue #530 の DDD 境界整理に従い、`unknown` の生データに対する
 * zod schema パースと `safeParseArrayFromStorage` 相当の配列パースまでを
 * 本 adapter 内に閉じ込める。listener には `TypedSavedTabsStorageChange`
 * discriminated union として検証済み typed payload だけが流れる。
 * 旧 `src/lib/storage/zod-storage` への依存は presentation 層から排除し、
 * 永続化 schema は本 adapter 配下（`savedTabsStorageSchema`）に
 * 統一する。port 段階では domain entity 化（branded id 付与）を
 * 敢えて行わず、`@/types/storage` の DTO 相当の plain object を
 * payload として流す（entity 化が必要なのは repository 実装側の責務）。
 *
 * @example
 * ```ts
 * const port: StorageChangePort = createChromeStorageChangeAdapter()
 * const unsubscribe = port.subscribe((changes) => {
 *   // changes は TypedSavedTabsStorageChange の配列
 * })
 * // unmount 時に呼ぶ
 * unsubscribe()
 * ```
 */

import { z } from 'zod'

import {
  toSavedTabsCustomProjectDto,
  toSavedTabsParentCategoryDto,
  toSavedTabsTabGroupDto,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { CHROME_STORAGE_CHANGE_ADAPTER_MARKER } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type {
  SavedTabsStorageChangeKey,
  StorageChangePort,
  TypedSavedTabsStorageChange,
} from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import { ChromeSavedTabsStorageMapper } from '@/contexts/saved-tabs/infrastructure/mappers/ChromeSavedTabsStorageMapper'
import {
  CustomProjectRawSchema,
  ParentCategoryRawSchema,
  SavedTabRawSchema,
  UserSettingsRawSchema,
} from '@/contexts/saved-tabs/infrastructure/persistence/chrome-storage/savedTabsStorageSchema'
import type { ChromeOnChangedListener } from '@/lib/browser/chrome-storage'
import { getChromeStorageOnChanged } from '@/lib/browser/chrome-storage'

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

const isSavedTabsStorageChangeKey = (
  key: string,
): key is SavedTabsStorageChangeKey => {
  return (
    key === 'savedTabs' ||
    key === 'urls' ||
    key === 'parentCategories' ||
    key === 'customProjects' ||
    key === 'customProjectOrder' ||
    key === 'userSettings'
  )
}

/**
 * `unknown` の生データから `TypedSavedTabsStorageChange` を組み立てる。
 *
 * `chrome.storage.onChanged` の payload は `unknown` なので、port 境界で
 * 必ず zod schema 検証 + domain factory での entity 化を行ってから
 * typed payload として emit する。
 * 配列要素単位のスキップは `safeParseArrayFromStorage` 相当の挙動で
 * 取り扱い、1 件壊れた要素で配列全体が破棄されないよう保つ
 * （issue #530 / 旧 `modeSyncService` の P2 修正を port 側へ移動）。
 */
const safeParseArrayPayload = <T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T>[] => {
  if (!Array.isArray(value)) {
    return []
  }
  const results: z.output<T>[] = []
  for (let i = 0; i < value.length; i += 1) {
    const item: unknown = value[i]
    const parsed = schema.safeParse(item)
    if (parsed.success) {
      results.push(parsed.data)
      continue
    }
    console.warn(
      `[storage] 配列要素 ${i} のパースに失敗したためスキップしました`,
      parsed.error.issues,
    )
  }
  return results
}

const PartialUserSettingsRawSchema = UserSettingsRawSchema.partial()
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

  const buildTypedChange = (
    key: SavedTabsStorageChangeKey,
    change: { newValue?: unknown; oldValue?: unknown },
  ): TypedSavedTabsStorageChange | null => {
    const oldValue = change.oldValue
    const newValue = change.newValue
    if (key === 'urls') {
      return {
        key,
        kind: 'noPayload',
        newValue,
        oldValue,
      }
    }
    if (key === 'savedTabs') {
      const payload = safeParseArrayPayload(
        SavedTabRawSchema,
        newValue,
      ).flatMap((raw) => {
        const entity = ChromeSavedTabsStorageMapper.toTabGroupFromRaw(raw)
        return entity ? [toSavedTabsTabGroupDto(entity)] : []
      })
      return {
        key,
        kind: 'parsed',
        oldValue,
        payload,
      }
    }
    if (key === 'parentCategories') {
      const payload = safeParseArrayPayload(
        ParentCategoryRawSchema,
        newValue,
      ).flatMap((raw) => {
        const entity = ChromeSavedTabsStorageMapper.toParentCategoryFromRaw(raw)
        return entity ? [toSavedTabsParentCategoryDto(entity)] : []
      })
      return {
        key,
        kind: 'parsed',
        oldValue,
        payload,
      }
    }
    if (key === 'customProjects') {
      // raw 段階では `categories` / `createdAt` / `updatedAt` が
      // optional（legacy データ対応、issue #530 review P1）。DTO 形
      // (`@/types/storage` の `CustomProject`) では必須のため、
      // port 境界で default を入れてから payload として流す。
      // `categories` 未設定時は `[]`、`createdAt` / `updatedAt` 未設定時
      // は `0`（mapper の entity 化と整合する default）。
      const payload = safeParseArrayPayload(
        CustomProjectRawSchema,
        newValue,
      ).flatMap((raw) => {
        const entity = ChromeSavedTabsStorageMapper.toCustomProjectFromRaw(raw)
        return entity ? [toSavedTabsCustomProjectDto(entity)] : []
      })
      return {
        key,
        kind: 'parsed',
        oldValue,
        payload,
      }
    }
    if (key === 'customProjectOrder') {
      return {
        key,
        kind: 'parsed',
        oldValue,
        payload: safeParseArrayPayload(z.string(), newValue),
      }
    }
    return {
      key,
      kind: 'parsed',
      oldValue,
      payload: parseUserSettingsPayload(newValue),
    }
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
        const events: TypedSavedTabsStorageChange[] = []
        for (const [key, change] of Object.entries(changes)) {
          if (!isSavedTabsStorageChangeKey(key)) {
            continue
          }
          const event = buildTypedChange(key, change)
          if (event) {
            events.push(event)
          }
        }
        listener(events)
      }
      onChanged.addListener(wrappedListener)
      return () => {
        onChanged.removeListener(wrappedListener)
      }
    },
  }
}
