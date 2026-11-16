import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { SavedTabsCustomProjectRawSnapshotDto } from '@/contexts/saved-tabs/application/dto/SavedTabsCustomProjectRawSnapshotDto'
import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { SavedTabsUrlRecordRawSnapshotDto } from '@/contexts/saved-tabs/application/dto/SavedTabsUrlRecordRawSnapshotDto'
import { toSavedTabsCustomProjectRawSnapshotDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsCustomProjectRawSnapshotMapper'
import { toSavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { BuildSavedTabsSnapshotUseCaseDeps } from '@/contexts/saved-tabs/application/use-cases/BuildSavedTabsSnapshotUseCase'
import { createBuildSavedTabsSnapshotUseCase } from '@/contexts/saved-tabs/application/use-cases/BuildSavedTabsSnapshotUseCase'
import type { CollectionProjectionDto } from '@/contexts/saved-tabs/domain/dto/CollectionProjectionDto'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRawSnapshot } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

/**
 * undo 用途の `CustomProject` 読み取りスナップショット (issue #538)。
 *
 * - `customProjectOrder`: 削除直前の `customProjectOrder`。
 * - `customProjects`: `findAll()` (entity 経路) で取得した entity 一覧。
 * - `customProjectsRaw`: `findAllRaw()` (raw 経路) で取得した snapshot
 *   一覧。rich フィールド (`urls` / `urlMetadata` / `projectKeywords` /
 *   `categoryOrder`) を保持する。
 * - `openedUrlsSnapshot`: ドメイン・URL・カテゴリを含む共通保存データ。
 *   `includeSavedUrls` 指定時だけ取得し、URL 削除を両モードで復元する。
 *
 * カスタム固有フィールドは該当データが無い場合に省略する。
 * `RestoreCustomProjectsSnapshotUseCase` 側で payload 化してから
 * `customProjectRepository.restoreAllRaw` / `saveAll` に渡す。
 */
export type CustomProjectUndoSnapshot = {
  customProjectOrder?: readonly string[]
  customProjects?: readonly SavedTabsCustomProjectDto[]
  customProjectsRaw?: readonly SavedTabsCustomProjectRawSnapshotDto[]
  /** URL deletion changes both modes; Undo must restore their shared records. */
  openedUrlsSnapshot?: OpenedUrlsRestoreSnapshot
  urlRecordsRaw?: readonly SavedTabsUrlRecordRawSnapshotDto[]
}

/**
 * presentation 層が undo 用途に「`CustomProject` 表示順 + entity +
 * raw snapshot」を一括取得するときの application query (issue #538)。
 *
 * 旧 `useProjectManagement.getCustomProjectUndoSnapshot` (private
 * helper) の責務を application query として切り出す。`findOrder` と
 * `findAllRaw` (`findAll` フォールバック) を 1 関数に束ね、
 * presentation 層が「order / entity / raw を別々に取得して組み立てる」
 * ロジックを持つ必要をなくす。
 *
 * 旧実装と異なり、`customProjectOrder` は array length > 0 のときだけ
 * 設定する (空配列を payload 化すると `saveOrder([])` が誤って
 * 走ってしまうため)。
 */
export type GetCustomProjectUndoSnapshotQuery = (options?: {
  readonly includeSavedUrls?: boolean
  readonly targets?: readonly {
    readonly projectId: string
    readonly urls: readonly string[]
  }[]
}) => Promise<CustomProjectUndoSnapshot>

/**
 * `GetCustomProjectUndoSnapshotQuery` が依存する repository 群。
 */
export type GetCustomProjectUndoSnapshotQueryDeps =
  BuildSavedTabsSnapshotUseCaseDeps

const entityFromRaw = (raw: CustomProjectRawSnapshot): CustomProject =>
  toSavedTabsCustomProjectDto(raw)

const selectMemberships = <Collection extends CollectionProjectionDto>(
  collections: readonly Collection[],
  selectedIds: ReadonlySet<string>,
): Collection[] =>
  collections.flatMap((collection) => {
    const memberships = collection.memberships.filter(({ urlId }) =>
      selectedIds.has(urlId),
    )
    return memberships.length > 0 ? [{ ...collection, memberships }] : []
  })

const selectSavedUrlsSnapshot = (
  snapshot: OpenedUrlsRestoreSnapshot,
  targets: NonNullable<
    NonNullable<Parameters<GetCustomProjectUndoSnapshotQuery>[0]>['targets']
  >,
): OpenedUrlsRestoreSnapshot => {
  const idByUrl = new Map(snapshot.urlRecords?.map(({ id, url }) => [url, id]))
  const selectedIds = new Set<string>(
    targets.flatMap(({ projectId, urls }) => {
      const source = snapshot.customProjects?.find(({ id }) => id === projectId)
      const requestedIds = new Set(urls.map((url) => idByUrl.get(url)))
      return (source?.memberships ?? [])
        .filter(({ urlId }) => requestedIds.has(urlId))
        .map(({ urlId }) => urlId)
    }),
  )
  const savedTabs = selectMemberships(snapshot.savedTabs ?? [], selectedIds)
  const customProjects = selectMemberships(
    snapshot.customProjects ?? [],
    selectedIds,
  )
  const domainIds = new Set<string>(savedTabs.map(({ id }) => id))
  const projectIds = new Set<string>(customProjects.map(({ id }) => id))
  return {
    customProjectOrder: (snapshot.customProjectOrder ?? []).filter((id) =>
      projectIds.has(id),
    ),
    customProjects,
    parentCategories: (snapshot.parentCategories ?? []).flatMap((category) => {
      const collections = category.collections.filter(({ id }) =>
        domainIds.has(id),
      )
      return collections.length > 0 ? [{ ...category, collections }] : []
    }),
    savedTabs,
    urlRecords: (snapshot.urlRecords ?? []).filter(({ id }) =>
      selectedIds.has(id),
    ),
  }
}

const readSavedUrlsUndoSnapshot = async (
  deps: GetCustomProjectUndoSnapshotQueryDeps,
  options: NonNullable<Parameters<GetCustomProjectUndoSnapshotQuery>[0]>,
): Promise<
  Pick<CustomProjectUndoSnapshot, 'openedUrlsSnapshot' | 'urlRecordsRaw'>
> => {
  if (!options.includeSavedUrls) {
    return {}
  }
  const fullSnapshot = await createBuildSavedTabsSnapshotUseCase(deps)({})
  const openedUrlsSnapshot = options.targets
    ? selectSavedUrlsSnapshot(fullSnapshot, options.targets)
    : fullSnapshot
  const selectedIds = options.targets
    ? new Set(openedUrlsSnapshot.urlRecords?.map(({ id }) => id))
    : undefined
  const urlRecordsRaw = deps.urlRecordRepository.findAllRaw
    ? structuredClone(
        (await deps.urlRecordRepository.findAllRaw()).filter(
          ({ id }) => !selectedIds || selectedIds.has(id),
        ),
      )
    : undefined
  return {
    openedUrlsSnapshot,
    ...(urlRecordsRaw ? { urlRecordsRaw } : {}),
  }
}

/**
 * `GetCustomProjectUndoSnapshotQuery` を生成する。
 *
 * 責務:
 * 1. URL 削除用に指定された場合だけ、共通保存データを取得する。
 *    取得に失敗した場合は不完全な Undo を返さず reject する。
 * 2. `customProjectRepository.findOrder()` で order を取得
 * 3. `findAllRaw` 実装があればそれを使い、raw snapshot と entity 形を
 *    両方返す (issue #535 P1: rich フィールド保持)
 * 4. `findAllRaw` 未実装の legacy repository では `findAll()` (entity)
 *    だけでフォールバックする
 *
 * @example
 * ```ts
 * const getCustomProjectUndoSnapshot = createGetCustomProjectUndoSnapshotQuery({
 *   customProjectRepository, tabGroupRepository,
 *   urlRecordRepository, parentCategoryRepository,
 * })
 * const snapshot = await getCustomProjectUndoSnapshot()
 * ```
 */
export const createGetCustomProjectUndoSnapshotQuery = (
  deps: GetCustomProjectUndoSnapshotQueryDeps,
): GetCustomProjectUndoSnapshotQuery => {
  return async (options = {}): Promise<CustomProjectUndoSnapshot> => {
    const sharedSnapshot = await readSavedUrlsUndoSnapshot(deps, options)
    const { openedUrlsSnapshot } = sharedSnapshot
    const order =
      options.targets && openedUrlsSnapshot
        ? (openedUrlsSnapshot.customProjectOrder ?? [])
        : await deps.customProjectRepository.findOrder()
    const base: CustomProjectUndoSnapshot = {
      ...sharedSnapshot,
      ...(order.length > 0 ? { customProjectOrder: [...order] } : {}),
    }
    if (options.targets && openedUrlsSnapshot) {
      const projects = openedUrlsSnapshot.customProjects ?? []
      return {
        ...base,
        customProjects: projects,
        ...(deps.customProjectRepository.findAllRaw
          ? { customProjectsRaw: projects }
          : {}),
      }
    }
    if (deps.customProjectRepository.findAllRaw) {
      const raws = await deps.customProjectRepository.findAllRaw()
      const projects = raws.map((raw) =>
        toSavedTabsCustomProjectDto(entityFromRaw(raw)),
      )
      return {
        ...base,
        ...(projects.length > 0 ? { customProjects: projects } : {}),
        ...(raws.length > 0
          ? {
              customProjectsRaw: raws.map(
                toSavedTabsCustomProjectRawSnapshotDto,
              ),
            }
          : {}),
      }
    }
    const projects = await deps.customProjectRepository.findAll()
    return {
      ...base,
      ...(projects.length > 0
        ? { customProjects: projects.map(toSavedTabsCustomProjectDto) }
        : {}),
    }
  }
}
