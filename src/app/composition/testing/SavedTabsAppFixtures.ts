import type {
  SavedTabsCustomProjectDto,
  SavedTabsParentCategoryDto,
  SavedTabsTabGroupDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { SavedTabsUseCasesDeps } from '@/contexts/saved-tabs/application/SavedTabsUseCasesDeps'
import type { DomainCategorySettingsDto } from '@/contexts/saved-tabs/domain/dto/DomainCategorySettingsDto'
import { createCustomProject as createDomainCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup as createDomainTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { normalizeUserSettings } from '@/contexts/saved-tabs/domain/services/UserSettingsDefaults'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'
import { createChromeBrowserTabAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserTabAdapter'
import { createChromeBrowserWindowAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeBrowserWindowAdapter'
import { createChromeStorageChangeAdapter } from '@/contexts/saved-tabs/infrastructure/browser/ChromeStorageChangeAdapter'
import type { ChromeStorageOnChangedLike } from '@/contexts/saved-tabs/infrastructure/browser/ChromeStorageChangeAdapter'
import { createSonnerNotificationAdapter } from '@/contexts/saved-tabs/infrastructure/browser/SonnerNotificationAdapter'
import type {
  SavedTabsCustomProjectDto as ProjectView,
  SavedTabsParentCategoryDto as ParentView,
  SavedTabsTabGroupDto as GroupView,
  SavedTabsUrlRecordDto as UrlView,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

type GroupFixture = GroupView & {
  readonly urlIds?: readonly string[]
  readonly urlSubCategories?: Readonly<Record<string, string>>
}
type ParentFixture = Pick<ParentView, 'id' | 'name'> & {
  readonly collections?: SavedTabsParentCategoryDto['collections']
  readonly domains?: readonly string[]
  readonly domainNames?: readonly string[]
}
type FixtureSeed = {
  savedTabs: readonly (GroupFixture | SavedTabsTabGroupDto)[]
  parentCategories: readonly ParentFixture[]
  customProjects: readonly (ProjectView | SavedTabsCustomProjectDto)[]
  customProjectOrder: readonly string[]
  urls: readonly UrlView[]
  userSettings: unknown
  domainCategoryMappings: readonly { domain: string; categoryId: string }[]
  domainCategorySettings: readonly DomainCategorySettingsDto[]
}

/** Explicit test-only repository/browser injection; no Chrome domain storage. */
export type SavedTabsUiFixtureApi = {
  repositories: {
    data: {
      read: (keys: string | string[]) => Promise<Partial<FixtureSeed>>
      write: (values: Partial<FixtureSeed>) => Promise<void>
    }
    changes?: ChromeStorageOnChangedLike
  }
  tabs?: {
    create?: (input: {
      active?: boolean
      url: string
    }) => Promise<{ url?: string } | undefined> | undefined
  }
  windows?: {
    create?: (input: {
      focused?: boolean
      url?: string | readonly string[]
    }) =>
      | Promise<{ tabs?: readonly { url?: string }[] } | undefined>
      | undefined
  }
}

export const toAppTabGroupFixture = (
  group: GroupFixture | SavedTabsTabGroupDto,
): SavedTabsTabGroupDto => {
  if ('collection' in group) {
    return group
  }
  return createTabGroup({
    id: group.id,
    domain: group.domain,
    ...(group.parentCategoryId !== undefined
      ? { parentCategoryId: group.parentCategoryId }
      : {}),
    ...(group.savedAt !== undefined ? { savedAt: group.savedAt } : {}),
    ...(group.subCategories !== undefined
      ? { subCategories: group.subCategories }
      : {}),
    ...(group.categoryKeywords !== undefined
      ? { categoryKeywords: group.categoryKeywords }
      : {}),
    ...(group.subCategoryOrder !== undefined
      ? { subCategoryOrder: group.subCategoryOrder }
      : {}),
    memberships:
      group.memberships ??
      group.urlIds?.map((urlId) => ({
        urlId,
        ...(group.urlSubCategories?.[urlId] !== undefined
          ? { category: group.urlSubCategories[urlId] }
          : {}),
      })) ??
      [],
  })
}

export const toAppParentCategoryFixture = (
  category: ParentFixture,
): SavedTabsParentCategoryDto => ({
  id: category.id,
  name: category.name,
  collections:
    category.collections ??
    category.domains?.map((id, index) => ({
      id,
      domain: category.domainNames?.[index] ?? id,
    })) ??
    [],
})

export const toAppCustomProjectFixture = (
  project: ProjectView | SavedTabsCustomProjectDto,
): SavedTabsCustomProjectDto => {
  if ('collection' in project) {
    return project
  }
  return createCustomProject({
    id: project.id,
    name: project.name,
    categories: project.categories,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    memberships: project.memberships ?? [],
  })
}

export const createSavedTabsUiTestDeps = ({
  getFixture,
  resolveActive,
  customProjectsCommandService,
}: {
  getFixture: () => SavedTabsUiFixtureApi
  resolveActive: () => boolean
  customProjectsCommandService: SavedTabsUseCasesDeps['customProjectsCommandService']
}): SavedTabsUseCasesDeps => {
  const read = async (key: string) => getFixture().repositories.data.read(key)
  const write = async (values: Partial<FixtureSeed>) =>
    getFixture().repositories.data.write(values)
  const groups = async () =>
    (await read('savedTabs')).savedTabs?.map((group) =>
      createDomainTabGroup(toAppTabGroupFixture(group)),
    ) ?? []
  const parents = async () =>
    (await read('parentCategories')).parentCategories?.map((category) =>
      createParentCategory(toAppParentCategoryFixture(category)),
    ) ?? []
  const projects = async () =>
    (await read('customProjects')).customProjects?.map((project) =>
      createDomainCustomProject(toAppCustomProjectFixture(project)),
    ) ?? []
  const urls = async () => (await read('urls')).urls?.map(createUrlRecord) ?? []
  const tabGroupRepository: SavedTabsUseCasesDeps['tabGroupRepository'] = {
    findAll: groups,
    findById: async (id) =>
      (await groups()).find((group) => group.id === id) ?? null,
    findRawDomainById: async (id) =>
      (await groups()).find((group) => group.id === id)?.collection.name ??
      null,
    findRawTabGroupById: async (id) =>
      (await groups()).find((group) => group.id === id) ?? null,
    saveAll: async (next) => write({ savedTabs: next }),
    removeByIds: async (ids) =>
      write({
        savedTabs: (await groups()).filter(({ id }) => !ids.includes(id)),
      }),
  }
  const parentCategoryRepository: SavedTabsUseCasesDeps['parentCategoryRepository'] =
    {
      findAll: parents,
      findById: async (id) =>
        (await parents()).find((category) => category.id === id) ?? null,
      saveAll: async (next) => write({ parentCategories: next }),
      removeByIds: async (ids) =>
        write({
          parentCategories: (await parents()).filter(
            ({ id }) => !ids.includes(id),
          ),
        }),
    }
  return {
    tabGroupRepository,
    parentCategoryRepository,
    customProjectRepository: {
      findAll: projects,
      findById: async (id) =>
        (await projects()).find((project) => project.id === id) ?? null,
      saveAll: async (next) => write({ customProjects: next }),
      removeByIds: async (ids) =>
        write({
          customProjects: (await projects()).filter(
            ({ id }) => !ids.includes(id),
          ),
        }),
      findOrder: async () =>
        ((await read('customProjectOrder')).customProjectOrder ?? []).map(
          createCustomProjectId,
        ),
      saveOrder: async (order) => write({ customProjectOrder: order }),
      findAllRaw: projects,
      restoreAllRaw: async (next) => write({ customProjects: next }),
    },
    urlRecordRepository: {
      findAll: urls,
      findById: async (id) =>
        (await urls()).find((url) => url.id === id) ?? null,
      saveAll: async (next) => write({ urls: next }),
      removeByIds: async (ids) =>
        write({ urls: (await urls()).filter(({ id }) => !ids.includes(id)) }),
    },
    userSettingsRepository: {
      findAll: async () =>
        normalizeUserSettings(await read('userSettings')).normalized,
      save: async (settings) => write({ userSettings: settings }),
    },
    domainCategoryMappingRepository: {
      findAll: async () =>
        (await read('domainCategoryMappings')).domainCategoryMappings ?? [],
      saveAll: async (next) => write({ domainCategoryMappings: next }),
    },
    domainCategorySettingsRepository: {
      findAll: async () =>
        (await read('domainCategorySettings')).domainCategorySettings ?? [],
      saveAll: async (next) => write({ domainCategorySettings: next }),
    },
    categoryAssignmentPort: {
      saveTabGroups: async (next) =>
        tabGroupRepository.saveAll(next.map(createDomainTabGroup)),
      saveParentCategories: async (next) =>
        parentCategoryRepository.saveAll(next.map(createParentCategory)),
    },
    customProjectsCommandService,
    browserTabPort: createChromeBrowserTabAdapter(
      { getApi: getFixture },
      { resolveActive },
    ),
    browserWindowPort: createChromeBrowserWindowAdapter({ getApi: getFixture }),
    storageChangePort: createChromeStorageChangeAdapter({
      getOnChanged: () => getFixture().repositories.changes ?? null,
    }),
    clock: { now: () => Date.now() },
    idGenerator: { generate: () => crypto.randomUUID() },
    notificationPort: createSonnerNotificationAdapter(),
    messagingPort: { send: async () => undefined },
    categoriesCommandService: {
      updateCollectionCategories: async () => undefined,
    },
    removeSubCategoryFromTabGroupPort: {
      removeSubCategoryFromTabGroup: async () => groups(),
    },
    setCategoryKeywordsPort: { setCategoryKeywords: async () => undefined },
  }
}
