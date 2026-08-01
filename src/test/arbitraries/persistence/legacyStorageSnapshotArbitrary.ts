import * as fc from 'fast-check'

import type { RawLegacyStorageSnapshot } from '@/contexts/saved-tabs/public-api'
import type {
  CustomProject,
  DomainCategorySettings,
  DomainParentCategoryMapping,
  ParentCategory,
  TabGroup,
  UrlRecord,
} from '@/types/storage'

import {
  displayTextArbitrary,
  orderedTimestampPairArbitrary,
  timestampArbitrary,
  urlStringArbitrary,
} from './primitives'

const categoryNameArbitrary = fc.string({ minLength: 1, maxLength: 12 })

/**
 * Legacy reference modes per collection:
 * - `ids`: `urlIds` referencing canonical `urls` (new format). Custom
 *   projects additionally require parallel nested copies, because the
 *   migration treats `urlIds` without a same-length `urls` array as a
 *   conflict; tab groups accept `urlIds`-only references.
 * - `nested`: nested `urls` only, carrying inline data (old format)
 * - `mixed`: `urlIds` plus parallel nested copies of the same canonical
 *   records (the only conflict-free combination of both fields)
 */
const referenceModeArbitrary = fc.constantFrom('ids', 'mixed', 'nested')

const canonicalUrlSeedArbitrary = fc.record({
  savedAt: timestampArbitrary,
  title: displayTextArbitrary,
})

const groupSeedArbitrary = fc.record({
  mode: referenceModeArbitrary,
  nested: fc.array(
    fc.record({
      savedAt: timestampArbitrary,
      title: displayTextArbitrary,
    }),
    { maxLength: 2 },
  ),
  parentAssigned: fc.boolean(),
  savedAt: timestampArbitrary,
  subCategories: fc.uniqueArray(categoryNameArbitrary, { maxLength: 2 }),
})

const projectSeedArbitrary = fc.record({
  categories: fc.uniqueArray(categoryNameArbitrary, { maxLength: 2 }),
  mode: referenceModeArbitrary,
  nested: fc.array(
    fc.record({
      notes: displayTextArbitrary,
      savedAt: timestampArbitrary,
      title: displayTextArbitrary,
    }),
    { maxLength: 2 },
  ),
  timestamps: orderedTimestampPairArbitrary,
})

const wellFormedSeedArbitrary = fc.record({
  canonicalUrls: fc.array(canonicalUrlSeedArbitrary, { maxLength: 5 }),
  groups: fc.array(groupSeedArbitrary, { maxLength: 3 }),
  projects: fc.array(projectSeedArbitrary, { maxLength: 2 }),
})

type WellFormedSeed =
  typeof wellFormedSeedArbitrary extends fc.Arbitrary<infer T> ? T : never
type GroupSeed = WellFormedSeed['groups'][number]
type ProjectSeed = WellFormedSeed['projects'][number]

/**
 * Legacy chrome.storage content covering the historical shapes:
 * canonical `urls`, `TabGroup.urlIds` / nested `urls` / parallel mixed
 * groups, `urlSubCategories`, `CustomProject.urlIds` / `urls` /
 * `urlMetadata`, `ParentCategory.domains` / `domainNames`,
 * `parentCategoryId`, and `DomainParentCategoryMapping`. References are
 * mutually consistent and every timestamp is present so the v2 migration
 * result stays healthy.
 */
export type WellFormedLegacyStorage = {
  readonly customProjectOrder: readonly string[]
  readonly customProjects: readonly CustomProject[]
  readonly domainCategoryMappings: readonly DomainParentCategoryMapping[]
  readonly domainCategorySettings: readonly DomainCategorySettings[]
  readonly parentCategories: readonly ParentCategory[]
  readonly savedTabs: readonly TabGroup[]
  readonly urls: readonly UrlRecord[]
}

type AssemblyContext = {
  readonly urls: readonly UrlRecord[]
}

type ReferenceMode = 'ids' | 'mixed' | 'nested'

const resolveGroupMode = (
  group: GroupSeed,
  urlIds: readonly string[],
): ReferenceMode => {
  if (group.mode !== 'mixed') {
    return group.mode
  }
  if (urlIds.length > 0) {
    return 'mixed'
  }
  return group.nested.length > 0 ? 'nested' : 'ids'
}

const resolveProjectMode = (
  project: ProjectSeed,
  urlIds: readonly string[],
): ReferenceMode => {
  if (project.mode === 'nested') {
    return 'nested'
  }
  if (urlIds.length > 0) {
    return 'mixed'
  }
  return project.nested.length > 0 ? 'nested' : 'ids'
}

const assembleGroup = (
  group: GroupSeed,
  index: number,
  urlIds: readonly string[],
  context: AssemblyContext,
): TabGroup => {
  const subCategories = group.subCategories
  const canonicalById = new Map(context.urls.map((url) => [url.id, url]))
  const mode = resolveGroupMode(group, urlIds)
  const base: TabGroup = {
    domain: `domain-${index}.test`,
    id: `group-${index}`,
    ...(group.parentAssigned ? { parentCategoryId: 'category-parent-0' } : {}),
    savedAt: group.savedAt,
    ...(subCategories.length > 0 ? { subCategories } : {}),
  }
  const urlSubCategories =
    urlIds.length > 0 && subCategories.length > 0
      ? Object.fromEntries(
          urlIds.map((id, position) => [
            id,
            subCategories[position % subCategories.length],
          ]),
        )
      : undefined

  if (mode === 'nested') {
    return {
      ...base,
      urls: group.nested.map((nested, nestedIndex) => ({
        id: `url-nested-${index}-${nestedIndex}`,
        savedAt: nested.savedAt,
        ...(subCategories.length > 0
          ? {
              subCategory: subCategories[nestedIndex % subCategories.length],
            }
          : {}),
        title: nested.title,
        url: `https://nested-${index}-${nestedIndex}.example/`,
      })),
    }
  }
  if (mode === 'mixed') {
    return {
      ...base,
      urlIds: [...urlIds],
      ...(urlSubCategories ? { urlSubCategories } : {}),
      urls: urlIds.map((id) => {
        const canonical = canonicalById.get(id)
        return {
          id,
          savedAt: canonical?.savedAt,
          title: canonical?.title ?? '',
          url: canonical?.url ?? '',
        }
      }),
    }
  }
  return {
    ...base,
    urlIds: [...urlIds],
    ...(urlSubCategories ? { urlSubCategories } : {}),
  }
}

const assembleProject = (
  project: ProjectSeed,
  index: number,
  urlIds: readonly string[],
  context: AssemblyContext,
): CustomProject => {
  const categories = project.categories
  const canonicalById = new Map(context.urls.map((url) => [url.id, url]))
  const mode = resolveProjectMode(project, urlIds)
  const base: CustomProject = {
    categories,
    createdAt: project.timestamps[0],
    id: `project-${index}`,
    name: `Project ${index}`,
    updatedAt: project.timestamps[1],
  }
  const urlMetadata =
    urlIds.length > 0
      ? Object.fromEntries(
          urlIds.map((id, position) => [
            id,
            {
              notes: `note-${index}-${position}`,
              ...(categories.length > 0
                ? { category: categories[position % categories.length] }
                : {}),
            },
          ]),
        )
      : undefined

  if (mode === 'nested') {
    return {
      ...base,
      urls: project.nested.map((nested, nestedIndex) => ({
        ...(categories.length > 0
          ? { category: categories[nestedIndex % categories.length] }
          : {}),
        notes: nested.notes,
        savedAt: nested.savedAt,
        title: nested.title,
        url: `https://project-${index}-${nestedIndex}.example/`,
      })),
    }
  }
  if (mode === 'mixed') {
    return {
      ...base,
      urlIds: [...urlIds],
      ...(urlMetadata ? { urlMetadata } : {}),
      urls: urlIds.map((id) => {
        const canonical = canonicalById.get(id)
        return {
          savedAt: canonical?.savedAt,
          title: canonical?.title ?? '',
          url: canonical?.url ?? '',
        }
      }),
    }
  }
  return {
    ...base,
    urlIds: [...urlIds],
    ...(urlMetadata ? { urlMetadata } : {}),
  }
}

const assembleWellFormed = (seed: WellFormedSeed): WellFormedLegacyStorage => {
  // Canonical urls must be referenced by an ids/mixed collection;
  // nested-only collections cannot reference them and would orphan them.
  const referenceTargets = [
    ...seed.groups.flatMap((group, index) =>
      group.mode === 'nested' ? [] : [{ kind: 'group', index } as const],
    ),
    ...seed.projects.flatMap((project, index) =>
      project.mode === 'nested' ? [] : [{ kind: 'project', index } as const],
    ),
  ]
  const urls: UrlRecord[] =
    referenceTargets.length === 0
      ? []
      : seed.canonicalUrls.map((url, index) => ({
          id: `url-${index}`,
          savedAt: url.savedAt,
          title: url.title,
          url: `https://canonical-${index}.example/page`,
        }))
  const context: AssemblyContext = { urls }

  const groupUrlIds = seed.groups.map((): string[] => [])
  const projectUrlIds = seed.projects.map((): string[] => [])
  for (const [index, url] of urls.entries()) {
    const target = referenceTargets[index % referenceTargets.length]
    if (target.kind === 'group') {
      groupUrlIds[target.index].push(url.id)
    } else {
      projectUrlIds[target.index].push(url.id)
    }
  }

  const savedTabs = seed.groups.map((group, index) =>
    assembleGroup(group, index, groupUrlIds[index], context),
  )
  const customProjects = seed.projects.map((project, index) =>
    assembleProject(project, index, projectUrlIds[index], context),
  )

  const parentedGroups = savedTabs.filter(
    (group) => group.parentCategoryId !== undefined,
  )
  const parentCategories: ParentCategory[] =
    parentedGroups.length > 0
      ? [
          {
            domainNames: parentedGroups.map((group) => group.domain),
            domains: parentedGroups.map((group) => group.id),
            id: 'category-parent-0',
            name: 'Parent',
          },
        ]
      : []
  const domainCategoryMappings: DomainParentCategoryMapping[] =
    parentedGroups.map((group) => ({
      categoryId: 'category-parent-0',
      domain: group.domain,
    }))
  const domainCategorySettings: DomainCategorySettings[] = savedTabs
    .filter((group) => (group.subCategories?.length ?? 0) > 0)
    .map((group) => ({
      categoryKeywords: (group.subCategories ?? []).map((name) => ({
        categoryName: name,
        keywords: [name],
      })),
      domain: group.domain,
      subCategories: group.subCategories ?? [],
    }))

  return {
    customProjectOrder: customProjects.map((project) => project.id),
    customProjects,
    domainCategoryMappings,
    domainCategorySettings,
    parentCategories,
    savedTabs,
    urls,
  }
}

export const wellFormedLegacyStorageArbitrary =
  wellFormedSeedArbitrary.map(assembleWellFormed)

const present = (value: unknown) => ({ status: 'present', value }) as const

/** Wraps well-formed legacy storage into the raw reader port shape. */
export const toRawLegacyStorageSnapshot = (
  storage: WellFormedLegacyStorage,
): RawLegacyStorageSnapshot => ({
  activeAiChatConversationId: present(''),
  aiChatConversations: present([]),
  customProjectOrder: present(storage.customProjectOrder),
  customProjects: present(storage.customProjects),
  domainCategoryMappings: present(storage.domainCategoryMappings),
  domainCategorySettings: present(storage.domainCategorySettings),
  parentCategories: present(storage.parentCategories),
  savedAnalyticsViews: present([]),
  savedTabs: present(storage.savedTabs),
  urls: present(storage.urls),
})

/**
 * Same canonical URL referenced by multiple legacy tab groups. Covers the
 * #732 semantics: one Url entity, one membership per collection, and no
 * improper sync of `Membership.addedAt` into `Url.lastSavedAt`.
 */
export const sharedUrlLegacyStorageArbitrary = fc
  .record({
    groupCount: fc.integer({ min: 2, max: 3 }),
    groupSavedAts: fc.array(timestampArbitrary, {
      minLength: 3,
      maxLength: 3,
    }),
    savedAt: timestampArbitrary,
    title: displayTextArbitrary,
  })
  .map((seed): RawLegacyStorageSnapshot => {
    const savedTabs: TabGroup[] = Array.from(
      { length: seed.groupCount },
      (_, index) => ({
        domain: `shared-${index}.test`,
        id: `group-shared-${index}`,
        savedAt: seed.groupSavedAts[index],
        urlIds: ['url-shared'],
      }),
    )
    const urls: UrlRecord[] = [
      {
        id: 'url-shared',
        savedAt: seed.savedAt,
        title: seed.title,
        url: 'https://shared.example/page',
      },
    ]
    return {
      activeAiChatConversationId: present(''),
      aiChatConversations: present([]),
      customProjectOrder: present([]),
      customProjects: present([]),
      domainCategoryMappings: present([]),
      domainCategorySettings: present([]),
      parentCategories: present([]),
      savedAnalyticsViews: present([]),
      savedTabs: present(savedTabs),
      urls: present(urls),
    }
  })

const messyScalarArbitrary = fc.oneof(
  fc.jsonValue(),
  fc.record({
    id: fc.string({ maxLength: 8 }),
    savedAt: fc.integer(),
    title: fc.string({ maxLength: 8 }),
    url: fc.oneof(urlStringArbitrary, fc.string({ maxLength: 8 })),
  }),
)

const messyValueArbitrary = fc.oneof(
  messyScalarArbitrary,
  fc.array(messyScalarArbitrary, { maxLength: 4 }),
)

const messySourceValueArbitrary = fc.oneof(
  fc.constant({ status: 'missing' } as const),
  messyValueArbitrary.map((value) => ({ status: 'present', value }) as const),
)

/**
 * Malformed / partially corrupted raw storage: missing keys, wrong types,
 * dangling references, duplicate ids, and extreme timestamps. Used for
 * determinism and no-throw guarantees only, never for health assertions.
 */
export const rawLegacyStorageSnapshotArbitrary: fc.Arbitrary<RawLegacyStorageSnapshot> =
  fc.record({
    activeAiChatConversationId: messySourceValueArbitrary,
    aiChatConversations: messySourceValueArbitrary,
    customProjectOrder: messySourceValueArbitrary,
    customProjects: messySourceValueArbitrary,
    domainCategoryMappings: messySourceValueArbitrary,
    domainCategorySettings: messySourceValueArbitrary,
    parentCategories: messySourceValueArbitrary,
    savedAnalyticsViews: messySourceValueArbitrary,
    savedTabs: messySourceValueArbitrary,
    urls: messySourceValueArbitrary,
  })
