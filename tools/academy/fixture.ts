import {
  createDomainCollectionFixture,
  createEmptyPersistenceFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

export type AcademyScenario = 'minimal' | 'empty'

// Filming/test data only. No randomness, wall clock, real sites or user data.
export const academyManifest = {
  seed: 'academy-997-v1',
  savedAt: Date.UTC(2026, 0, 1, 12),
  parents: ['Learning', 'Personal'],
  sites: [
    {
      hostname: 'study.filming.test',
      parent: 'Learning',
      pages: [
        { path: '/guide', title: 'Study guide', category: 'Guides' },
        { path: '/reference', title: 'Study reference', category: 'Reference' },
      ],
    },
    {
      hostname: 'notes.filming.test',
      parent: 'Personal',
      pages: [
        { path: '/ideas', title: 'Notebook ideas', category: 'Ideas' },
        { path: '/inbox', title: 'Notebook inbox', category: undefined },
      ],
    },
    {
      hostname: 'garden.filming.test',
      parent: undefined,
      pages: [
        { path: '/seeds', title: 'Garden seeds', category: undefined },
        { path: '/journal', title: 'Garden journal', category: undefined },
      ],
    },
  ],
} as const

export const createAcademyFixture = (scenario: AcademyScenario = 'minimal') => {
  if (scenario === 'empty') {
    return createEmptyPersistenceFixture()
  }
  const { seed, savedAt, parents, sites } = academyManifest
  const id = (name: string) => `${seed}:${name}`
  return {
    groups: parents.map((name, index) => ({
      id: id(name),
      name,
      createdAt: savedAt,
      updatedAt: savedAt,
      sortOrder: index * 1024,
    })),
    collections: sites.map((site, index) => ({
      ...createDomainCollectionFixture(
        id(site.hostname),
        site.hostname,
        savedAt,
        index * 1024,
      ),
      ...(site.parent ? { groupId: id(site.parent) } : {}),
    })),
    categories: sites.flatMap((site) =>
      site.pages.flatMap((page, index) =>
        page.category
          ? [
              {
                id: id(`${site.hostname}:${page.category}`),
                collectionId: id(site.hostname),
                name: page.category,
                keywords: [],
                createdAt: savedAt,
                updatedAt: savedAt,
                sortOrder: index * 1024,
              },
            ]
          : [],
      ),
    ),
    urls: sites.flatMap((site) =>
      site.pages.map((page) =>
        createUrlFixture(
          id(`${site.hostname}${page.path}`),
          `https://${site.hostname}${page.path}`,
          page.title,
          savedAt,
        ),
      ),
    ),
    memberships: sites.flatMap((site) =>
      site.pages.map((page, index) => ({
        ...createMembershipFixture(
          id(site.hostname),
          id(`${site.hostname}${page.path}`),
          savedAt,
          index * 1024,
        ),
        ...(page.category
          ? { categoryId: id(`${site.hostname}:${page.category}`) }
          : {}),
      })),
    ),
  }
}
