/**
 * `chrome.storage.onChanged` 相当の storage change 購読を抽象化する port。
 *
 * application 層は `chrome.*` API を直接呼ばず、本 port 経由で
 * saved-tabs context が関心を持つ storage キーの変更通知を受け取る。
 * infrastructure 層が `ChromeStorageChangeAdapter` で本 port を実装し、
 * composition 層から use-case / presentation 層へ注入する。
 *
 * `chrome.storage.StorageChange` を port 境界で吸収し、
 * `key` / `oldValue` / `newValue` のみの port DTO として公開する。
 * これにより presentation / application 層は `chrome.*` の型を
 * 意識せず、購読ロジックを組める。
 *
 * 加えて issue #530 の DDD 境界整理に従い、payload は zod schema 検証
 * 済みの entity / DTO 配列（`TabGroup[]` / `ParentCategory[]` /
 * `CustomProject[]` / `Partial<UserSettings>[]` / `string[]`）として
 * port 境界で確定させる。presentation 層は `unknown` の生データを
 * 意識せず、discriminated union を switch で絞り込むだけで同期処理を
 * 組める（`as` キャスト不要）。
 *
 * 受け取る storage キーは port 仕様としてスコープを絞り込み、
 * port 利用側が関係ないキー（chrome.runtime 由来など）を
 * 意識しなくて済む形にする。
 *
 * @example
 * ```ts
 * const port: StorageChangePort = createChromeStorageChangeAdapter()
 * const unsubscribe = port.subscribe((changes) => {
 *   for (const change of changes) {
 *     // change.key は SavedTabsStorageChangeKey のみ
 *     if (change.kind === 'parsed') {
 *       // change.payload は検証済み entity / DTO の配列
 *     }
 *   }
 * })
 * // コンポーネント unmount 時に呼び出して listener を解放
 * unsubscribe()
 * ```
 */

import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UserSettings,
} from '@/types/storage'

/**
 * saved-tabs context が同期対象とする storage キー。
 *
 * 実 storage のキー（`chrome.storage.local` のフィールド名）に合わせて
 * 列挙する。`urlRecords` のような domain 用語ではなく、実装のキー名
 * (`urls` など) を採用する。
 */
export type SavedTabsStorageChangeKey =
  | 'savedTabs'
  | 'urls'
  | 'parentCategories'
  | 'customProjects'
  | 'customProjectOrder'
  | 'userSettings'

/**
 * port 経由で配信される 1 件分の storage 変更イベント。
 *
 * `oldValue` / `newValue` は `unknown` のままで渡し、受け取り側で
 * `safeParse` などのスキーマ検証にかける。port 仕様として
 * ドメイン entity を露出しない方針を維持する。
 *
 * @deprecated スキーマ検証は port 実装（`ChromeStorageChangeAdapter`）側に
 * 閉じ込める方針（issue #530）のため、presentation / application 層では
 * `TypedSavedTabsStorageChange` を使う。新規実装では unknown 形のこの型を
 * 直接扱わないこと。
 */
export interface SavedTabsStorageChange {
  readonly key: SavedTabsStorageChangeKey
  readonly oldValue: unknown
  readonly newValue: unknown
}

/**
 * port 段階でパース済みの typed payload を持つ storage 変更イベント。
 *
 * 受信側（presentation / application 層）は `chrome.*` の生データや
 * `unknown` を意識せず、`payload` プロパティから検証済みデータだけを
 * 受け取る。`urls` のような「payload を 持たないキー通知」は
 * `kind: 'noPayload'` として配送する。
 *
 * discriminated union なので、switch で `kind` を絞り込めば payload の
 * 型が `TabGroup[]` / `ParentCategory[]` / `CustomProject[]` /
 * `Partial<UserSettings>` などに確定する（issue #530 方針）。
 */
export type TypedSavedTabsStorageChange =
  | {
      readonly key: 'savedTabs'
      readonly kind: 'parsed'
      readonly oldValue: unknown
      readonly payload: TabGroup[]
    }
  | {
      readonly key: 'parentCategories'
      readonly kind: 'parsed'
      readonly oldValue: unknown
      readonly payload: ParentCategory[]
    }
  | {
      readonly key: 'customProjects'
      readonly kind: 'parsed'
      readonly oldValue: unknown
      readonly payload: CustomProject[]
    }
  | {
      readonly key: 'customProjectOrder'
      readonly kind: 'parsed'
      readonly oldValue: unknown
      readonly payload: string[]
    }
  | {
      readonly key: 'userSettings'
      readonly kind: 'parsed'
      readonly oldValue: unknown
      readonly payload: Partial<UserSettings>[]
    }
  | {
      readonly key: 'urls'
      readonly kind: 'noPayload'
      readonly oldValue: unknown
      readonly newValue: unknown
    }

/**
 * storage 変更通知の購読 port。
 *
 * `subscribe(listener)` を呼ぶと、port 実装が
 * `chrome.storage.onChanged` 相当の通知源に listener を登録し、
 * 解除用の関数（unsubscribe）を返す。`listener` には
 * saved-tabs 関連キーの変更だけが port DTO として届く。
 *
 * 実装側の `listener` 呼び出しは同期を基本とする。listener 内で
 * 非同期処理が必要になった場合は port 側ではなく listener 側で
 * `void asyncFn()` として fire-and-forget する。
 *
 * 複数回 `subscribe` を呼んでも port 実装が内部で複数 listener を
 * 持つ場合はリークしないよう、返り値の unsubscribe 関数を必ず
 * 呼び出すこと。
 */
export interface StorageChangePort {
  /**
   * `chrome` 由来の port 実装に付くマーカー。
   *
   * `SavedTabsPage` などの composition 層が「chrome 由来の port であるか」
   * を識別し、テストや SSR 用途の独自 port 実装を区別するために使う。
   * 任意実装の port では undefined か false を入れて良い。
   */
  readonly [CHROME_STORAGE_CHANGE_ADAPTER_MARKER]?: boolean
  /**
   * storage 変更通知を購読し、解除用関数を返す。
   *
   * listener は port 実装側で chrome API のリスナーが
   * 発火した直後に同期呼び出しされる。listener 内で発生した
   * 例外は port 側で握り潰さず呼び出し側へ伝播させる方針
   * （use-case 側の同期 service が失敗を可視化できるようにする）。
   *
   * listener には `TypedSavedTabsStorageChange` の配列が届く。
   * port 実装（`ChromeStorageChangeAdapter`）が
   * `chrome.storage.onChanged` の生データを zod schema 経由で
   * パースしてから通知するため、presentation / application 層は
   * `unknown` の生データや `chrome.*` 型を意識しなくてよい
   * （issue #530）。
   */
  subscribe: (
    listener: (changes: readonly TypedSavedTabsStorageChange[]) => void,
  ) => () => void
}

/**
 * `createChromeStorageChangeAdapter` が生成した port に付くマーカー symbol。
 *
 * port interface のプロパティキーとして export し、adapter 実装と
 * composition 層が同じ symbol を共有できるようにする。
 * `CHROME_BROWSER_TAB_ADAPTER_MARKER` と同じ運用方針。
 */
export const CHROME_STORAGE_CHANGE_ADAPTER_MARKER = Symbol.for(
  'tabbin.chromeStorageChangeAdapter',
)
