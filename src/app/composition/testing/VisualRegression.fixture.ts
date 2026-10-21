import { createSavedTabsUiTestDeps } from '@/app/composition/testing/SavedTabsAppFixtures'
import { createSavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type { CustomProjectsCommandService } from '@/contexts/saved-tabs/application/ports/CustomProjectsCommandService'
import { createSavedTabsTabGroupDto } from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures'
import { toSavedTabsTabGroupViewModel } from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'
import type { AppLanguage } from '@/features/i18n/messages'
import { defaultSettings } from '@/lib/storage/settings'

const SAVED_AT = Date.parse('2026-01-15T09:00:00Z')

// The visual fixture never performs project mutations or contacts a browser.
const rejectMutation = async (): Promise<never> => {
  throw new Error('Visual regression fixtures are read-only')
}

const customProjectsCommandService: CustomProjectsCommandService = {
  addCategoryToProject: rejectMutation,
  addUrlToCustomProject: rejectMutation,
  moveUrlBetweenCustomProjects: rejectMutation,
  removeCategoryFromProject: rejectMutation,
  removeUrlFromCustomProject: rejectMutation,
  removeUrlIdsFromAllCustomProjects: rejectMutation,
  removeUrlsFromAllCustomProjects: rejectMutation,
  removeUrlsFromCustomProject: rejectMutation,
  renameCategoryInProject: rejectMutation,
  reorderProjectUrls: rejectMutation,
  setUrlCategory: rejectMutation,
  updateCategoryOrder: rejectMutation,
  updateProjectKeywords: rejectMutation,
}

export const visualStoryStorage = {
  userSettings: {
    colors: {},
    excludePatterns: ['https://mail.example.test/*'],
    showRelativeSavedTime: false,
    showSavedTime: false,
  },
}

export const createVisualSavedTabsComposition = (locale: AppLanguage) => {
  const ja = locale === 'ja'
  const urls = [
    {
      id: 'visual-url-design',
      savedAt: SAVED_AT,
      title: ja ? 'デザインシステムのガイド' : 'Design system guide',
      url: 'https://docs.example.test/design-system',
    },
    {
      id: 'visual-url-accessibility',
      savedAt: SAVED_AT,
      title: ja
        ? 'アクセシビリティのチェックリスト'
        : 'Accessibility checklist',
      url: 'https://docs.example.test/accessibility',
    },
    {
      id: 'visual-url-research',
      savedAt: SAVED_AT,
      title: ja ? 'リサーチノート' : 'Research notes',
      url: 'https://research.example.test/notes',
    },
  ]
  const category = ja ? 'ガイド' : 'Guides'
  const groups = [
    createSavedTabsTabGroupDto({
      domain: 'docs.example.test',
      id: 'visual-group-docs',
      memberships: urls.slice(0, 2).map(({ id }) => ({
        category,
        urlId: id,
      })),
      savedAt: SAVED_AT,
      subCategories: [category],
      urls: urls.slice(0, 2).map((url) => ({ ...url, subCategory: category })),
    }),
    createSavedTabsTabGroupDto({
      domain: 'research.example.test',
      id: 'visual-group-research',
      memberships: [{ urlId: 'visual-url-research' }],
      savedAt: SAVED_AT,
      urls: urls.slice(2),
    }),
  ]
  const state = {
    customProjectOrder: [],
    customProjects: [],
    domainCategoryMappings: [],
    domainCategorySettings: [],
    parentCategories: [],
    savedTabs: groups,
    urls,
    userSettings: { ...defaultSettings, language: locale },
  }
  const deps = createSavedTabsUiTestDeps({
    customProjectsCommandService,
    getFixture: () => ({
      repositories: {
        data: {
          read: async () => state,
          write: rejectMutation,
        },
      },
    }),
    resolveActive: () => false,
  })
  return {
    deps,
    initialTabGroups: groups.map(toSavedTabsTabGroupViewModel),
    useCases: createSavedTabsUseCases(deps),
  }
}
