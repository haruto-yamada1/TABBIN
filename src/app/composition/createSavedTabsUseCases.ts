import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import { createSavedTabsUseCases as createContextsSavedTabsUseCases } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCases'
import { createSavedTabsUseCasesDeps } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps'
import type {
  CreateSavedTabsUseCasesDepsOptions,
  SavedTabsUseCasesDeps,
} from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps'

/**
 * `createSavedTabsUseCases` 呼び出し時に渡せる任意設定。
 *
 * presentation 層が `openUrlInBackground` 設定をランタイムで反映するため、
 * `resolveActive` を渡せるようにしている。`BrowserTabPort` の adapter に
 * 委譲される。`createSavedTabsPorts` の同名 option と同じ意味。
 */
export type CreateSavedTabsUseCasesOptions = CreateSavedTabsUseCasesDepsOptions

/**
 * `src/app/composition/` レベルの composition root。
 *
 * `chrome.storage.local` ベースの repository 実装と
 * `chrome.tabs` / `chrome.windows` / `sonner` ベースの port 実装を
 * 1 度だけ組み立て、そこから `saved-tabs` の優先 use-case を生成して返す。
 *
 * この関数以降、UI / hook / テストは
 * `chrome.*` API を直接触れず、use-case だけを呼び出す形になる。
 *
 * `options.resolveActive` を渡すと presentation 層が `openUrlInBackground`
 * のような設定値をランタイムで `BrowserTabPort` に反映できる。
 *
 * 実装は `src/contexts/saved-tabs/infrastructure/composition/` の
 * ファクトリに委譲する。`src/app/composition/` 配下は
 * `entrypoints` から 1 つの窓口として参照される薄いラッパ。
 *
 * @example
 * ```ts
 * const useCases = createSavedTabsUseCases({
 *   resolveActive: () => !settings.openUrlInBackground,
 * })
 * await useCases.openSavedUrl({ urlRecordId, origin: 'click', settings })
 * ```
 */
export const createSavedTabsUseCases = (
  options: CreateSavedTabsUseCasesOptions = {},
): SavedTabsUseCases => {
  const deps: SavedTabsUseCasesDeps = createSavedTabsUseCasesDeps(options)
  return createContextsSavedTabsUseCases(deps)
}
