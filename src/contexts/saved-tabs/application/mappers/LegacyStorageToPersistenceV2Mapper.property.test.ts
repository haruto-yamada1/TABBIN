import * as fc from 'fast-check'
import { describe, it } from 'vitest'

import { PERSISTENCE_V2_INVARIANT_CODES } from '@/contexts/saved-tabs/domain/entities/PersistenceModelV2'
import { checkPersistenceIntegrity } from '@/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker'
import { fastCheckParameters } from '@/test/arbitraries/persistence/fastCheckParameters'
import {
  rawLegacyStorageSnapshotArbitrary,
  sharedUrlLegacyStorageArbitrary,
  toRawLegacyStorageSnapshot,
  wellFormedLegacyStorageArbitrary,
} from '@/test/arbitraries/persistence/legacyStorageSnapshotArbitrary'

import { mapLegacyStorageToPersistenceV2 } from './LegacyStorageToPersistenceV2Mapper'

const MIGRATION_SPECIFIC_CODES = [
  'LEGACY_AI_ENTITY_ID_COLLISION',
  'LEGACY_CUSTOM_PROJECT_ORDER_CONFLICT',
  'LEGACY_DOMAIN_CATEGORY_MAPPING_CONFLICT',
  'LEGACY_PARENT_CATEGORY_CONFLICT',
  'LEGACY_URL_REFERENCE_CONFLICT',
  'MIGRATION_SOURCE_INVALID_TYPE',
  'MIGRATION_SOURCE_MISSING_KEY',
] as const

const KNOWN_ISSUE_CODES: ReadonlySet<string> = new Set([
  ...PERSISTENCE_V2_INVARIANT_CODES,
  ...MIGRATION_SPECIFIC_CODES,
])

// Property targets from issue #718: determinism, semantic preservation,
// and timestamp invariants for the #728 legacy storage migration.
describe('mapLegacyStorageToPersistenceV2 properties', () => {
  it('is deterministic for arbitrary raw storage input', () => {
    fc.assert(
      fc.property(rawLegacyStorageSnapshotArbitrary, (source) => {
        const first = mapLegacyStorageToPersistenceV2(source)
        const second = mapLegacyStorageToPersistenceV2(source)
        return JSON.stringify(first) === JSON.stringify(second)
      }),
      fastCheckParameters,
    )
  })

  it('reports only known issue codes for arbitrary raw storage input', () => {
    fc.assert(
      fc.property(rawLegacyStorageSnapshotArbitrary, (source) => {
        const { issueCodes } = mapLegacyStorageToPersistenceV2(source)
        return issueCodes.every((code) => KNOWN_ISSUE_CODES.has(code))
      }),
      fastCheckParameters,
    )
  })

  it('keeps timestamp invariants even after fallback for malformed input', () => {
    fc.assert(
      fc.property(rawLegacyStorageSnapshotArbitrary, (source) => {
        const { snapshot } = mapLegacyStorageToPersistenceV2(source)
        return (
          snapshot.urls.every((url) => url.firstSavedAt <= url.lastSavedAt) &&
          snapshot.memberships.every(
            (membership) => membership.addedAt <= membership.updatedAt,
          ) &&
          [
            ...snapshot.collections,
            ...snapshot.categories,
            ...snapshot.groups,
          ].every((entity) => entity.createdAt <= entity.updatedAt)
        )
      }),
      fastCheckParameters,
    )
  })

  it('produces healthy v2 snapshots from well-formed legacy storage', () => {
    fc.assert(
      fc.property(wellFormedLegacyStorageArbitrary, (storage) => {
        const { snapshot } = mapLegacyStorageToPersistenceV2(
          toRawLegacyStorageSnapshot(storage),
        )
        return checkPersistenceIntegrity(snapshot).isHealthy
      }),
      fastCheckParameters,
    )
  })

  it('preserves URLs, notes, and category relations from legacy storage', () => {
    fc.assert(
      fc.property(wellFormedLegacyStorageArbitrary, (storage) => {
        const { snapshot } = mapLegacyStorageToPersistenceV2(
          toRawLegacyStorageSnapshot(storage),
        )
        const urlsById = new Map(snapshot.urls.map((url) => [url.id, url]))
        const urlsByValue = new Map(snapshot.urls.map((url) => [url.url, url]))

        const canonicalPreserved = storage.urls.every(
          (url) => urlsById.get(url.id)?.url === url.url,
        )
        const nestedUrlStrings = [
          ...storage.savedTabs.flatMap((group) =>
            (group.urls ?? []).map((url) => url.url),
          ),
          ...storage.customProjects.flatMap((project) =>
            (project.urls ?? []).map((url) => url.url),
          ),
        ]
        const nestedPreserved = nestedUrlStrings.every((value) =>
          urlsByValue.has(value),
        )

        const findMembership = (collectionId: string, urlId: string) =>
          snapshot.memberships.find(
            (candidate) =>
              candidate.collectionId === collectionId &&
              candidate.urlId === urlId,
          )
        const categoryMatches = (
          collectionId: string,
          categoryId: string | undefined,
          name: string,
        ) => {
          const category = snapshot.categories.find(
            (candidate) => candidate.id === categoryId,
          )
          return (
            category?.collectionId === collectionId && category?.name === name
          )
        }

        const projectSemantics = storage.customProjects.every((project) =>
          (project.urls ?? []).every((nested) => {
            const url = urlsByValue.get(nested.url)
            if (!url) {
              return false
            }
            const membership = findMembership(project.id, url.id)
            if (!membership) {
              return false
            }
            if (
              nested.notes !== undefined &&
              membership.notes !== nested.notes
            ) {
              return false
            }
            if (
              nested.category !== undefined &&
              !categoryMatches(
                project.id,
                membership.categoryId,
                nested.category,
              )
            ) {
              return false
            }
            return true
          }),
        )

        const metadataSemantics = storage.customProjects.every((project) =>
          Object.entries(project.urlMetadata ?? {}).every(
            ([urlId, metadata]) => {
              const membership = findMembership(project.id, urlId)
              if (!membership) {
                return false
              }
              if (
                metadata.notes !== undefined &&
                membership.notes !== metadata.notes
              ) {
                return false
              }
              if (
                metadata.category !== undefined &&
                !categoryMatches(
                  project.id,
                  membership.categoryId,
                  metadata.category,
                )
              ) {
                return false
              }
              return true
            },
          ),
        )

        const groupSemantics = storage.savedTabs.every((group) =>
          Object.entries(group.urlSubCategories ?? {}).every(
            ([urlId, subCategory]) => {
              const membership = findMembership(group.id, urlId)
              return (
                membership !== undefined &&
                categoryMatches(group.id, membership.categoryId, subCategory)
              )
            },
          ),
        )

        const groupNestedSemantics = storage.savedTabs.every((group) =>
          (group.urls ?? []).every((nested) => {
            if (nested.id === undefined) {
              return true
            }
            const url = urlsByValue.get(nested.url)
            if (!url || url.id !== nested.id) {
              // Parallel mixed copies are covered by canonicalPreserved.
              return urlsById.has(nested.id)
            }
            const membership = findMembership(group.id, url.id)
            if (!membership) {
              return false
            }
            if (
              nested.subCategory !== undefined &&
              !categoryMatches(
                group.id,
                membership.categoryId,
                nested.subCategory,
              )
            ) {
              return false
            }
            return true
          }),
        )

        return (
          canonicalPreserved &&
          nestedPreserved &&
          projectSemantics &&
          metadataSemantics &&
          groupSemantics &&
          groupNestedSemantics
        )
      }),
      fastCheckParameters,
    )
  })

  it('keeps one Url and per-collection memberships for shared legacy URLs (#732)', () => {
    fc.assert(
      fc.property(sharedUrlLegacyStorageArbitrary, (source) => {
        const { snapshot } = mapLegacyStorageToPersistenceV2(source)
        const shared = snapshot.urls.filter(
          (url) => url.url === 'https://shared.example/page',
        )
        if (shared.length !== 1) {
          return false
        }
        const [url] = shared
        const memberships = snapshot.memberships.filter(
          (membership) => membership.urlId === url.id,
        )
        const collectionIds = new Set(
          memberships.map((membership) => membership.collectionId),
        )
        const savedTabs =
          source.savedTabs.status === 'present' &&
          Array.isArray(source.savedTabs.value)
            ? (source.savedTabs.value as readonly {
                id: string
                savedAt?: number
              }[])
            : []
        const groupSavedAt = new Map(
          savedTabs.map((group) => [group.id, group.savedAt ?? 0]),
        )
        // Membership.addedAt follows the collection-side timestamp and
        // must not be overwritten by Url.lastSavedAt (#732 semantics).
        return (
          url.firstSavedAt <= url.lastSavedAt &&
          collectionIds.size >= 2 &&
          memberships.length === collectionIds.size &&
          memberships.every(
            (membership) =>
              membership.addedAt ===
                groupSavedAt.get(membership.collectionId) &&
              membership.addedAt <= membership.updatedAt,
          )
        )
      }),
      fastCheckParameters,
    )
  })
})
