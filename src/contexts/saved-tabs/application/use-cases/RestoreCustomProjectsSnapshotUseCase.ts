import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { SavedTabsCustomProjectRawSnapshotDto } from '@/contexts/saved-tabs/application/dto/SavedTabsCustomProjectRawSnapshotDto'
import type {
  SavedTabsCustomProjectDto,
  SavedTabsParentCategoryDto,
  SavedTabsTabGroupDto,
  SavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { SavedTabsUrlRecordRawSnapshotDto } from '@/contexts/saved-tabs/application/dto/SavedTabsUrlRecordRawSnapshotDto'
import { toCustomProjectRawSnapshot } from '@/contexts/saved-tabs/application/mappers/SavedTabsCustomProjectRawSnapshotMapper'
import { toCreateCustomProjectInput } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { CollectionProjectionDto } from '@/contexts/saved-tabs/domain/dto/CollectionProjectionDto'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

import type { RestoreOpenedUrlsSnapshotUseCaseDeps } from './RestoreOpenedUrlsSnapshotUseCase'
import { createRestoreOpenedUrlsSnapshotUseCase } from './RestoreOpenedUrlsSnapshotUseCase'

/**
 * undo 復元で `RestoreCustomProjectsSnapshotUseCase` に渡す payload。
 *
 * `getCustomProjectUndoSnapshotQuery` の戻り値 (`CustomProjectUndoSnapshot`)
 * は「該当データが無いときフィールドが省略される optional」だが、
 * 復元用 payload では `customProjects` を必須とし、order / raw は
 * optional に固定する。order 省略時は `saveOrder([])` 相当の
 * 「全消去」セマンティクスを明示するため、呼び出し側で
 * `customProjectOrder ?? []` ではなく省略有無を意識する。
 */
export type RestoreCustomProjectsSnapshotPayload = {
  readonly customProjectOrder?: readonly string[]
  readonly customProjects: readonly SavedTabsCustomProjectDto[]
  readonly customProjectsRaw?: readonly SavedTabsCustomProjectRawSnapshotDto[]
  readonly openedUrlsSnapshot?: OpenedUrlsRestoreSnapshot
  readonly urlRecordsRaw?: readonly SavedTabsUrlRecordRawSnapshotDto[]
}

/**
 * `RestoreCustomProjectsSnapshotUseCase` の入力。
 */
export type RestoreCustomProjectsSnapshotCommand = {
  readonly payload: RestoreCustomProjectsSnapshotPayload
}

/**
 * `RestoreCustomProjectsSnapshotUseCase` の戻り値。
 *
 * 副作用完了だけを表す `void`。
 */
export type RestoreCustomProjectsSnapshotUseCase = (
  command: RestoreCustomProjectsSnapshotCommand,
) => Promise<void>

/**
 * `RestoreCustomProjectsSnapshotUseCase` が依存する repository 群。
 */
export type RestoreCustomProjectsSnapshotUseCaseDeps =
  RestoreOpenedUrlsSnapshotUseCaseDeps

const mergeSnapshotItems = <Item>(
  snapshot: readonly Item[],
  current: readonly Item[],
  key: (item: Item) => string,
): Item[] => {
  const snapshotKeys = new Set(snapshot.map(key))
  return [
    ...snapshot,
    ...current.filter((item) => !snapshotKeys.has(key(item))),
  ]
}

const mergeCollectionSnapshots = <
  Collection extends CollectionProjectionDto & { readonly id: string },
>(
  snapshot: readonly Collection[],
  current: readonly Collection[],
): Collection[] => {
  const currentById = new Map(current.map((item) => [item.id, item]))
  const merged = snapshot.map((item) => {
    const existing = currentById.get(item.id)
    if (!existing) {
      return item
    }
    return {
      ...item,
      ...existing,
      collectionCategories: mergeSnapshotItems(
        existing.collectionCategories,
        item.collectionCategories,
        ({ id }) => id,
      ),
      // Undo fills missing memberships without replacing edits to recaptured URLs.
      memberships: mergeSnapshotItems(
        existing.memberships,
        item.memberships,
        ({ urlId }) => urlId,
      ),
    }
  })
  return mergeSnapshotItems(merged, current, ({ id }) => id)
}

const mergeParentCategorySnapshots = (
  snapshot: readonly SavedTabsParentCategoryDto[],
  current: readonly SavedTabsParentCategoryDto[],
  groups: readonly SavedTabsTabGroupDto[],
): SavedTabsParentCategoryDto[] => {
  const rankByCollection = new Map<string, number>(
    groups.map(({ id, collection }) => [id, collection.sortOrder]),
  )
  const snapshotParentByCollection = new Map(
    snapshot.flatMap((category) =>
      category.collections.map(({ id }) => [id, category.id] as const),
    ),
  )
  const compatibleCurrent = current.map((category) => ({
    ...category,
    collections: category.collections.filter(({ id }) => {
      const snapshotParent = snapshotParentByCollection.get(id)
      return snapshotParent === undefined || snapshotParent === category.id
    }),
  }))
  const currentById = new Map(
    compatibleCurrent.map((category) => [category.id, category]),
  )
  return mergeSnapshotItems(
    snapshot.map((category) => ({
      ...category,
      ...currentById.get(category.id),
      collections: mergeSnapshotItems(
        category.collections,
        currentById.get(category.id)?.collections ?? [],
        ({ id }) => id,
      ).toSorted(
        (left, right) =>
          (rankByCollection.get(left.id) ?? 0) -
          (rankByCollection.get(right.id) ?? 0),
      ),
    })),
    compatibleCurrent,
    ({ id }) => id,
  )
}

const remapCollectionUrlIds = <Collection extends CollectionProjectionDto>(
  collections: readonly Collection[],
  urlIdMap: ReadonlyMap<string, UrlRecordId>,
): Collection[] =>
  collections.map((collection) => ({
    ...collection,
    memberships: collection.memberships.map((membership) => ({
      ...membership,
      urlId: urlIdMap.get(membership.urlId) ?? membership.urlId,
    })),
  }))

const remapDomainCollections = (
  snapshot: readonly SavedTabsTabGroupDto[],
  current: readonly SavedTabsTabGroupDto[],
) => {
  const currentById = new Map(current.map((group) => [group.id, group]))
  const currentByDomain = new Map(
    current.map((group) => [group.collection.definition.domain, group]),
  )
  const collectionIdMap = new Map<string, string>()
  const groups = snapshot.map((group) => {
    const existing =
      currentById.get(group.id) ??
      currentByDomain.get(group.collection.definition.domain)
    if (!existing || existing.id === group.id) {
      return group
    }
    collectionIdMap.set(group.id, existing.id)
    const categoryIds = new Map(
      group.collectionCategories.map((category) => [
        category.id,
        existing.collectionCategories.find(
          ({ id, name }) => id === category.id || name === category.name,
        )?.id ?? category.id,
      ]),
    )
    return createTabGroup({
      collection: { ...group.collection, id: existing.id },
      collectionCategories: group.collectionCategories.map((category) => ({
        ...category,
        collectionId: existing.id,
        id: categoryIds.get(category.id) ?? category.id,
      })),
      memberships: group.memberships.map((membership) => ({
        ...membership,
        collectionId: existing.id,
        ...(membership.categoryId !== undefined && membership.categoryId !== ''
          ? {
              categoryId:
                categoryIds.get(membership.categoryId) ?? membership.categoryId,
            }
          : {}),
      })),
    })
  })
  return { collectionIdMap, groups }
}

const mapSnapshotUrlIds = (
  snapshot: readonly SavedTabsUrlRecordDto[],
  snapshotRaw: readonly SavedTabsUrlRecordRawSnapshotDto[],
  current: readonly {
    readonly id: string
    readonly normalizedUrl?: string
    readonly url: string
  }[],
): ReadonlyMap<string, UrlRecordId> => {
  const snapshotRawById = new Map(
    snapshotRaw.map((record) => [record.id, record]),
  )
  const currentIdByUrl = new Map(
    current.map((record) => [record.normalizedUrl ?? record.url, record.id]),
  )
  return new Map(
    snapshot.map((record) => [
      record.id,
      createUrlRecordId(
        currentIdByUrl.get(
          snapshotRawById.get(record.id)?.normalizedUrl ?? record.url,
        ) ?? record.id,
      ),
    ]),
  )
}

const mergeUrlDeletionSnapshot = async (
  payload: RestoreCustomProjectsSnapshotPayload,
  snapshot: OpenedUrlsRestoreSnapshot,
  deps: RestoreCustomProjectsSnapshotUseCaseDeps,
): Promise<RestoreCustomProjectsSnapshotPayload> => {
  const [groups, projects, parents, order, currentUrls] = await Promise.all([
    deps.tabGroupRepository.findAll(),
    deps.customProjectRepository.findAllRaw
      ? deps.customProjectRepository.findAllRaw()
      : deps.customProjectRepository.findAll(),
    deps.parentCategoryRepository.findAll(),
    deps.customProjectRepository.findOrder(),
    deps.urlRecordRepository.findAllRaw
      ? deps.urlRecordRepository.findAllRaw()
      : deps.urlRecordRepository.findAll(),
  ])
  const urlIdMap = mapSnapshotUrlIds(
    snapshot.urlRecords ?? [],
    payload.urlRecordsRaw ?? [],
    currentUrls,
  )
  const currentUrlIds = new Set(currentUrls.map(({ id }) => id))
  const customProjects = mergeCollectionSnapshots(
    remapCollectionUrlIds(
      payload.customProjectsRaw ?? payload.customProjects,
      urlIdMap,
    ),
    projects,
  )
  const remappedDomains = remapDomainCollections(
    remapCollectionUrlIds(snapshot.savedTabs ?? [], urlIdMap),
    groups,
  )
  const savedTabs = mergeCollectionSnapshots(remappedDomains.groups, groups)
  const savedTabsById = new Map<string, SavedTabsTabGroupDto>(
    savedTabs.map((group) => [group.id, group]),
  )
  const remappedParents = (snapshot.parentCategories ?? []).flatMap(
    (category) => {
      const collections = category.collections.flatMap((reference) => {
        const id =
          remappedDomains.collectionIdMap.get(reference.id) ?? reference.id
        return savedTabsById.get(id)?.collection.groupId === category.id
          ? [{ ...reference, id }]
          : []
      })
      return collections.length > 0 ? [{ ...category, collections }] : []
    },
  )
  const customProjectOrder = [
    ...new Set([
      ...order,
      ...(payload.customProjectOrder ?? snapshot.customProjectOrder ?? []),
    ]),
  ]
  return {
    ...payload,
    customProjectOrder,
    customProjects,
    ...(payload.urlRecordsRaw
      ? {
          urlRecordsRaw: payload.urlRecordsRaw.filter(
            ({ id }) => !currentUrlIds.has(urlIdMap.get(id) ?? id),
          ),
        }
      : {}),
    ...(payload.customProjectsRaw ? { customProjectsRaw: customProjects } : {}),
    openedUrlsSnapshot: {
      ...snapshot,
      customProjectOrder,
      customProjects,
      parentCategories: mergeParentCategorySnapshots(
        remappedParents,
        parents,
        savedTabs,
      ),
      savedTabs,
      urlRecords: (snapshot.urlRecords ?? []).filter(
        ({ id }) => !currentUrlIds.has(urlIdMap.get(id) ?? id),
      ),
    },
  }
}

/**
 * `RestoreCustomProjectsSnapshotUseCase` を生成する (issue #538)。
 *
 * 責務:
 * 1. 共通 snapshot があれば、削除されたドメイン・URL・カテゴリも復元する。
 * 2. payload に `customProjectsRaw` があり repository 側に
 *    `restoreAllRaw` 実装があれば、それで生 snapshot をそのまま
 *    書き戻す (issue #535 P1: `urls` / `urlMetadata` /
 *    `projectKeywords` / `categoryOrder` などの rich フィールドを
 *    merge 介在なしで保持)
 * 3. それ以外は `customProjectRepository.saveAll(payload.customProjects)`
 *    にフォールバックする (`DeleteCustomProjectUseCase` と同じ挙動)
 * 4. 続けて `customProjectRepository.saveOrder(payload.customProjectOrder ?? [])`
 *    で表示順を書き戻す
 *
 * 旧 `useProjectManagement.showCustomProjectDeleteUndoToast` 内の
 * `restoreAllRaw` / `saveAll` / `saveOrder` 3 段呼び出しを 1 つの
 * use-case に統合する。
 *
 * @example
 * ```ts
 * const restoreCustomProjectsSnapshot = createRestoreCustomProjectsSnapshotUseCase({
 *   customProjectRepository, tabGroupRepository,
 *   urlRecordRepository, parentCategoryRepository,
 * })
 * await restoreCustomProjectsSnapshot({ payload: snapshot })
 * ```
 */
export const createRestoreCustomProjectsSnapshotUseCase = (
  deps: RestoreCustomProjectsSnapshotUseCaseDeps,
): RestoreCustomProjectsSnapshotUseCase => {
  const restoreOpenedUrlsSnapshot = createRestoreOpenedUrlsSnapshotUseCase(deps)
  return async (command) => {
    const payload = command.payload.openedUrlsSnapshot
      ? await mergeUrlDeletionSnapshot(
          command.payload,
          command.payload.openedUrlsSnapshot,
          deps,
        )
      : command.payload
    // Capture current raw metadata before the normalized restore writes URL DTOs.
    const existingUrlRecordsRaw =
      payload.urlRecordsRaw && deps.urlRecordRepository.findAllRaw
        ? await deps.urlRecordRepository.findAllRaw()
        : undefined
    if (payload.openedUrlsSnapshot) {
      await restoreOpenedUrlsSnapshot({ snapshot: payload.openedUrlsSnapshot })
    }
    if (
      payload.urlRecordsRaw &&
      existingUrlRecordsRaw &&
      deps.urlRecordRepository.restoreAllRaw
    ) {
      const restoredIds = new Set(payload.urlRecordsRaw.map(({ id }) => id))
      await deps.urlRecordRepository.restoreAllRaw([
        ...existingUrlRecordsRaw.filter(({ id }) => !restoredIds.has(id)),
        ...payload.urlRecordsRaw,
      ])
    }
    if (
      payload.customProjectsRaw &&
      deps.customProjectRepository.restoreAllRaw
    ) {
      await deps.customProjectRepository.restoreAllRaw(
        payload.customProjectsRaw.map(toCustomProjectRawSnapshot),
      )
    } else {
      await deps.customProjectRepository.saveAll(
        payload.customProjects
          .map(toCreateCustomProjectInput)
          .map(createCustomProject),
      )
    }
    const order = (payload.customProjectOrder ?? []).map(createCustomProjectId)
    await deps.customProjectRepository.saveOrder(order)
  }
}
