import type {
  ExpiredUrlRecoveryMembership,
  ExpiredUrlRecoveryRecord,
} from '@/contexts/saved-tabs/domain/entities/ExpiredUrlRecovery'
import type {
  PersistenceV2Collection,
  PersistenceV2Snapshot,
  PersistenceV2Url,
} from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'

export const EXPIRED_URL_RECOVERY_DAYS = 30
export const MAX_EXPIRED_URL_RECOVERY_COUNT = 2_000
const MAX_RECOVERY_BYTES = 8_388_608
const MILLISECONDS_PER_DAY = 86_400_000
const RECOVERY_DURATION_MS = EXPIRED_URL_RECOVERY_DAYS * MILLISECONDS_PER_DAY

export type ExpiredUrlRecoveryState = {
  -readonly [
    Key in keyof PersistenceV2Snapshot
  ]: PersistenceV2Snapshot[Key][number][]
} & { expiredUrls: ExpiredUrlRecoveryRecord[] }

type ExpireSavedUrlsOptions = {
  readonly cutoff: number
  readonly generateId: () => string
  readonly now: number
  readonly protectFavorite: boolean
}

export const isRecoverableExpiredUrl = (
  record: ExpiredUrlRecoveryRecord,
  now: number,
): boolean => record.recoverUntil > now

export const getRecoverableExpiredUrls = (
  records: readonly ExpiredUrlRecoveryRecord[],
  now: number,
): ExpiredUrlRecoveryRecord[] =>
  records.filter((record) => isRecoverableExpiredUrl(record, now))

const retainDomainCollections = (
  state: ExpiredUrlRecoveryState,
  affectedDomainIds: ReadonlySet<string>,
): PersistenceV2Collection[] => {
  const retainedDomains = new Set([
    ...state.memberships.map(({ collectionId }) => collectionId),
    ...state.categories.map(({ collectionId }) => collectionId),
  ])
  return state.collections.filter(
    ({ id, groupId, uncategorizedCategoryPosition }) =>
      !affectedDomainIds.has(id) ||
      retainedDomains.has(id) ||
      groupId !== undefined ||
      uncategorizedCategoryPosition !== undefined,
  )
}

const archiveMemberships = (
  state: ExpiredUrlRecoveryState,
  candidates: ReadonlySet<string>,
  collections: ReadonlyMap<string, PersistenceV2Collection>,
): ReadonlyMap<string, ExpiredUrlRecoveryMembership[]> => {
  const categories = new Map(state.categories.map((item) => [item.id, item]))
  const byUrl = new Map<string, ExpiredUrlRecoveryMembership[]>()
  for (const membership of state.memberships) {
    if (!candidates.has(membership.urlId)) {
      continue
    }
    const collection = collections.get(membership.collectionId)
    if (!collection) {
      throw new Error('Cannot archive a URL with an unknown collection.')
    }
    const { categoryId, ...uncategorized } = membership
    const category =
      categoryId !== undefined && categoryId !== ''
        ? categories.get(categoryId)
        : undefined
    const archived = byUrl.get(membership.urlId) ?? []
    archived.push({
      collection,
      // An empty category ID is the legacy representation of uncategorized.
      membership: categoryId === '' ? uncategorized : membership,
      ...(category ? { category } : {}),
    })
    byUrl.set(membership.urlId, archived)
  }
  return byUrl
}

const allocateId = (
  ids: { readonly has: (id: string) => boolean },
  generateId: () => string,
): string => {
  const id = generateId()
  if (ids.has(id)) {
    throw new Error('Cannot allocate a unique URL recovery identifier.')
  }
  return id
}

const archiveWithinCapacity = (
  expiredUrls: ExpiredUrlRecoveryRecord[],
  urls: ReadonlyMap<string, PersistenceV2Url>,
  memberships: ReadonlyMap<string, ExpiredUrlRecoveryMembership[]>,
  { generateId, now }: ExpireSavedUrlsOptions,
) => {
  const archivedIds = new Set(expiredUrls.map(({ id }) => id))
  const encoder = new TextEncoder()
  const recordBytes = (record: ExpiredUrlRecoveryRecord): number =>
    encoder.encode(JSON.stringify(record)).byteLength
  let bytes = expiredUrls.reduce(
    (total, record) => total + recordBytes(record),
    0,
  )
  const archivedUrlIds = new Set<string>()
  const affectedDomainIds = new Set<string>()
  for (const [urlId, originalMemberships] of memberships) {
    if (expiredUrls.length >= MAX_EXPIRED_URL_RECOVERY_COUNT) {
      break
    }
    const url = urls.get(urlId)
    if (!url) {
      throw new Error('Cannot archive a missing URL.')
    }
    const record: ExpiredUrlRecoveryRecord = {
      expiredAt: now,
      id: allocateId(archivedIds, generateId),
      memberships: originalMemberships,
      recoverUntil: now + RECOVERY_DURATION_MS,
      url,
    }
    const size = recordBytes(record)
    if (bytes + size > MAX_RECOVERY_BYTES) {
      continue
    }
    bytes += size
    expiredUrls.push(record)
    archivedIds.add(record.id)
    archivedUrlIds.add(urlId)
    for (const { collection } of originalMemberships) {
      if (collection.definition.type === 'domain') {
        affectedDomainIds.add(collection.id)
      }
    }
  }

  return { archivedUrlIds, affectedDomainIds }
}

export const expireSavedUrls = (
  state: ExpiredUrlRecoveryState,
  options: ExpireSavedUrlsOptions,
) => {
  const { cutoff, now, protectFavorite } = options
  const expiredUrls = getRecoverableExpiredUrls(state.expiredUrls, now)
  const collections = new Map(state.collections.map((item) => [item.id, item]))
  const urls = new Map(state.urls.map((url) => [url.id, url]))
  const candidates = new Set<string>()
  let sourceCount = 0
  for (const { collectionId, urlId } of state.memberships) {
    if (collections.get(collectionId)?.definition.type !== 'domain') {
      continue
    }
    sourceCount += 1
    const url = urls.get(urlId)
    if (
      url &&
      url.lastSavedAt < cutoff &&
      !(protectFavorite && url.isFavorite === true)
    ) {
      candidates.add(urlId)
    }
  }
  if (
    candidates.size === 0 ||
    expiredUrls.length >= MAX_EXPIRED_URL_RECOVERY_COUNT
  ) {
    return {
      state: { ...state, expiredUrls },
      result: { removedCount: 0, sourceCount },
    }
  }

  const memberships = archiveMemberships(state, candidates, collections)
  const { archivedUrlIds, affectedDomainIds } = archiveWithinCapacity(
    expiredUrls,
    urls,
    memberships,
    options,
  )
  const next = {
    ...state,
    expiredUrls,
    memberships: state.memberships.filter(
      ({ urlId }) => !archivedUrlIds.has(urlId),
    ),
    urls: state.urls.filter(({ id }) => !archivedUrlIds.has(id)),
  }
  return {
    state: {
      ...next,
      collections: retainDomainCollections(next, affectedDomainIds),
    },
    result: { removedCount: archivedUrlIds.size, sourceCount },
  }
}

type RestoreExpiredUrlsOptions = {
  readonly generateId: () => string
  readonly getFallbackCollection: (
    state: ExpiredUrlRecoveryState,
  ) => PersistenceV2Collection
  readonly maxNoteBytes: number
  readonly now: number
}

const membershipKey = (collectionId: string, urlId: string): string =>
  JSON.stringify([collectionId, urlId])

const createRestoreIndex = (
  state: ExpiredUrlRecoveryState,
  selected: readonly ExpiredUrlRecoveryRecord[],
) => {
  const urlsByIdentity = new Map(
    state.urls.map((url) => [url.normalizedUrl, url]),
  )
  const selectedLiveUrlIds = new Set(
    selected.map(({ url }) => urlsByIdentity.get(url.normalizedUrl)?.id),
  )
  const membershipIndexes = new Map<string, number>()
  for (const [index, membership] of state.memberships.entries()) {
    if (selectedLiveUrlIds.has(membership.urlId)) {
      membershipIndexes.set(
        membershipKey(membership.collectionId, membership.urlId),
        index,
      )
    }
  }
  const domainsByName = new Map<string, PersistenceV2Collection>()
  for (const collection of state.collections) {
    if (collection.definition.type === 'domain') {
      domainsByName.set(collection.definition.domain, collection)
    }
  }
  return {
    categoriesById: new Map(
      state.categories.map((category) => [category.id, category]),
    ),
    collectionsById: new Map(
      state.collections.map((collection) => [collection.id, collection]),
    ),
    domainsByName,
    groupIds: new Set(state.groups.map(({ id }) => id)),
    membershipIndexes,
    urlsByIdentity,
    urlIds: new Set(state.urls.map(({ id }) => id)),
  }
}

type RestoreIndex = ReturnType<typeof createRestoreIndex>

const restoreUrl = (
  state: ExpiredUrlRecoveryState,
  index: RestoreIndex,
  archived: PersistenceV2Url,
  { generateId, now }: RestoreExpiredUrlsOptions,
): PersistenceV2Url => {
  const current = index.urlsByIdentity.get(archived.normalizedUrl)
  if (current) {
    return current
  }
  const lastSavedAt = Math.max(now, archived.lastSavedAt)
  const restored: PersistenceV2Url = {
    ...archived,
    id: index.urlIds.has(archived.id)
      ? allocateId(index.urlIds, generateId)
      : archived.id,
    lastSavedAt,
    lastSavedAtProvenance:
      now >= archived.lastSavedAt
        ? 'exact'
        : (archived.lastSavedAtProvenance ?? 'legacy-fallback'),
    updatedAt: Math.max(lastSavedAt, archived.updatedAt),
  }
  state.urls.push(restored)
  index.urlsByIdentity.set(restored.normalizedUrl, restored)
  index.urlIds.add(restored.id)
  return restored
}

const findCustomCollection = (
  index: RestoreIndex,
  id: string,
): PersistenceV2Collection | undefined => {
  const current = index.collectionsById.get(id)
  return current?.definition.type === 'custom' ? current : undefined
}

const resolveCollection = (
  state: ExpiredUrlRecoveryState,
  index: RestoreIndex,
  original: PersistenceV2Collection,
  { generateId, getFallbackCollection }: RestoreExpiredUrlsOptions,
): PersistenceV2Collection => {
  const { definition } = original
  if (definition.type === 'custom') {
    const current = findCustomCollection(index, original.id)
    if (current) {
      return current
    }
    const fallback = getFallbackCollection(state)
    index.collectionsById.set(fallback.id, fallback)
    return fallback
  }
  const current = index.domainsByName.get(definition.domain)
  if (current) {
    return current
  }
  const { groupId, ...withoutGroup } = original
  const restored: PersistenceV2Collection = {
    ...withoutGroup,
    ...(groupId !== undefined && index.groupIds.has(groupId)
      ? { groupId }
      : {}),
    id: index.collectionsById.has(original.id)
      ? allocateId(index.collectionsById, generateId)
      : original.id,
  }
  state.collections.push(restored)
  index.collectionsById.set(restored.id, restored)
  index.domainsByName.set(definition.domain, restored)
  return restored
}

const mergeFallbackNotes = (
  current: string | undefined,
  archived: string | undefined,
  maxBytes: number,
): string | undefined => {
  if (archived === undefined || archived.length === 0 || archived === current) {
    return undefined
  }
  const notes =
    current === undefined || current.length === 0
      ? archived
      : `${current}

${archived}`
  if (new TextEncoder().encode(notes).byteLength > maxBytes) {
    throw new Error('Merged recovery notes exceed the membership limit.')
  }
  return notes
}

type RecoveryMembershipTarget = {
  readonly archived: ExpiredUrlRecoveryMembership
  readonly collection: PersistenceV2Collection
  readonly fellBack: boolean
  readonly urlId: string
}

const restoreMembership = (
  state: ExpiredUrlRecoveryState,
  index: RestoreIndex,
  { archived, collection, fellBack, urlId }: RecoveryMembershipTarget,
  options: RestoreExpiredUrlsOptions,
): void => {
  const key = membershipKey(collection.id, urlId)
  const position = index.membershipIndexes.get(key)
  const existing =
    position === undefined ? undefined : state.memberships[position]
  const { categoryId, ...membership } = archived.membership
  if (position !== undefined && existing) {
    // Several deleted projects may share the same fallback membership.
    const notes = fellBack
      ? mergeFallbackNotes(
          existing.notes,
          membership.notes,
          options.maxNoteBytes,
        )
      : undefined
    if (notes !== undefined) {
      state.memberships.splice(position, 1, {
        ...existing,
        notes,
        updatedAt: Math.max(options.now, existing.updatedAt),
      })
    }
    return
  }
  const category =
    categoryId === undefined ? undefined : index.categoriesById.get(categoryId)
  const categoryExists = !fellBack && category?.collectionId === collection.id
  index.membershipIndexes.set(key, state.memberships.length)
  state.memberships.push({
    ...membership,
    ...(categoryExists ? { categoryId } : {}),
    collectionId: collection.id,
    updatedAt: Math.max(options.now, membership.updatedAt),
    urlId,
  })
}

export const restoreExpiredUrls = (
  state: ExpiredUrlRecoveryState,
  ids: ReadonlySet<string>,
  options: RestoreExpiredUrlsOptions,
) => {
  const expiredUrls = getRecoverableExpiredUrls(state.expiredUrls, options.now)
  const selected = expiredUrls
    .filter(({ id }) => ids.has(id))
    .toSorted(
      (left, right) =>
        right.expiredAt - left.expiredAt || left.id.localeCompare(right.id),
    )
  const next = {
    ...state,
    collections: [...state.collections],
    expiredUrls: expiredUrls.filter(({ id }) => !ids.has(id)),
    memberships: [...state.memberships],
    urls: [...state.urls],
  }
  if (selected.length === 0) {
    return { state: next, result: 0 }
  }
  const index = createRestoreIndex(next, selected)
  const fallbackTargets: RecoveryMembershipTarget[] = []
  for (const record of selected) {
    const url = restoreUrl(next, index, record.url, options)
    for (const archived of record.memberships) {
      const collection = resolveCollection(
        next,
        index,
        archived.collection,
        options,
      )
      const target = {
        archived,
        collection,
        fellBack:
          archived.collection.definition.type === 'custom' &&
          collection.id !== archived.collection.id,
        urlId: url.id,
      }
      if (target.fellBack) {
        fallbackTargets.push(target)
      } else {
        restoreMembership(next, index, target, options)
      }
    }
  }

  // A newer archive's fallback must not replace an older direct membership.
  for (const target of fallbackTargets) {
    restoreMembership(next, index, target, options)
  }
  return { state: next, result: selected.length }
}

export const discardExpiredUrls = (
  records: readonly ExpiredUrlRecoveryRecord[],
  ids: ReadonlySet<string>,
  now: number,
) => {
  const recoverable = getRecoverableExpiredUrls(records, now)
  const expiredUrls = recoverable.filter(({ id }) => !ids.has(id))
  return { expiredUrls, removedCount: recoverable.length - expiredUrls.length }
}
