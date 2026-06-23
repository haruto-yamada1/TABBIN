import { createSavedTabsUseCases as createApplicationSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/SavedTabsUseCases'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import { createSavedTabsUseCasesDeps as createInfrastructureSavedTabsUseCasesDeps } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps'
import type { CreateSavedTabsUseCasesDepsOptions } from '@/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps'

/**
 * `createSavedTabsUseCases` 呼び出し時に渡せる任意設定。
 *
 * presentation 層が `openUrlInBackground` 設定をランタイムで反映するため、
 * `resolveActive` を渡せるようにしている。`BrowserTabPort` の adapter に
 * 委譲される。`createSavedTabsPorts` の同名 option と同じ意味。
 */
export type CreateSavedTabsUseCasesOptions = CreateSavedTabsUseCasesDepsOptions

export const createSavedTabsUseCasesDeps = (
  options: CreateSavedTabsUseCasesDepsOptions = {},
): SavedTabsUseCasesDeps => createInfrastructureSavedTabsUseCasesDeps(options)

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
  return createApplicationSavedTabsUseCases(deps)
}

/**
 * `SavedTabsUseCasesDeps` から presentation 層が必要とする port 群
 * (`SavedTabsPresentationPorts`) へ投影する。
 *
 * presentation 層は永続化 repository を直接扱わず、use-case 経由で
 * データを操作する。そのため composition 段階で use-case 構築に使った
 * deps のうち、presentation が呼ぶ非永続 port だけを切り出して渡す。
 */
const toSavedTabsPresentationPorts = (
  deps: SavedTabsUseCasesDeps,
): SavedTabsPresentationPorts => ({
  browserTabPort: deps.browserTabPort,
  categoryAssignmentPort: deps.categoryAssignmentPort,
  messagingPort: deps.messagingPort,
  migrationPort: deps.migrationPort,
  storageChangePort: deps.storageChangePort,
})

/**
 * saved-tabs presentation 層が受け取る依存バンドルを一度に構築する。
 *
 * `SavedTabsRoute` の `createDeps` prop (`SavedTabsDepsFactory`) に
 * 対する production 用 factory。infrastructure deps を 1 度だけ組み立て、
 * そこから presentation ports と use-case 群を同時に生成して返す。
 *
 * 旧 `src/features/navigation/app/AppRouter` が
 * `@/contexts/saved-tabs/application/createSavedTabsUseCases` へ直接
 * 依存して wiring を行っていた箇所 (#588) を composition root へ集約し、
 * legacy feature code が context 内部へ依存しないようにする。
 *
 * `options.resolveActive` を渡すと `BrowserTabPort` 配下のタブ open が
 * 実行時に設定値を反映する。
 */
export const createSavedTabsPresentationComposition = (
  options: CreateSavedTabsUseCasesDepsOptions = {},
): {
  readonly deps: SavedTabsPresentationPorts
  readonly useCases: SavedTabsUseCases
} => {
  const deps = createSavedTabsUseCasesDeps(options)
  return {
    deps: toSavedTabsPresentationPorts(deps),
    useCases: createApplicationSavedTabsUseCases(deps),
  }
}
