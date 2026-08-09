import { describe, expect, it } from 'vitest'

import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import {
  toSavedTabsCustomProjectDto,
  toSavedTabsParentCategoryDto,
  toSavedTabsTabGroupDto,
  toSavedTabsUrlRecordDto,
  toSavedTabsUserSettingsDto,
} from './SavedTabsPresentationMapper'

describe('SavedTabsPresentationMapper', () => {
  it('domain entitiesをplain application DTOへ独立コピーする', () => {
    const project = createCustomProject({
      categories: ['research'],
      createdAt: 10,
      id: 'project-1',
      name: 'Research',
      updatedAt: 20,
      memberships: ['url-1'].map((urlId) => ({ urlId })),
    })
    const category = createParentCategory({
      collections: ['group-1'].map((id, index) => ({
        id,
        domain: ['example.com'][index] ?? id,
      })),
      id: 'category-1',
      name: 'Docs',
    })
    const group = createTabGroup({
      categoryKeywords: [
        {
          categoryName: 'docs',
          keywords: ['guide'],
        },
      ],
      domain: 'example.com',
      id: 'group-1',
      parentCategoryId: 'category-1',
      savedAt: 30,
      subCategories: ['docs'],
      subCategoryOrder: ['docs'],
      subCategoryOrderWithUncategorized: ['docs', 'uncategorized'],
      memberships: ['url-1'].map((urlId) => ({
        urlId,
        ...({ 'url-1': 'docs' }?.[urlId]
          ? { category: { 'url-1': 'docs' }[urlId] }
          : {}),
      })),
    })
    const record = createUrlRecord({
      favIconUrl: 'https://example.com/favicon.ico',
      id: 'url-1',
      savedAt: 30,
      title: 'Example',
      url: 'https://example.com',
    })

    const projectDto = toSavedTabsCustomProjectDto(project)
    expect(projectDto).toStrictEqual(project)
    expect(projectDto).not.toBe(project)
    expect(projectDto.collectionCategories).not.toBe(
      project.collectionCategories,
    )
    expect(toSavedTabsParentCategoryDto(category)).toStrictEqual({
      collections: ['group-1'].map((id, index) => ({
        id,
        domain: ['example.com'][index] ?? id,
      })),
      id: 'category-1',
      name: 'Docs',
    })
    const groupDto = toSavedTabsTabGroupDto(group)
    expect(groupDto).toStrictEqual(group)
    expect(groupDto).not.toBe(group)
    expect(groupDto.collectionCategories).not.toBe(group.collectionCategories)
    expect(toSavedTabsUrlRecordDto(record)).toStrictEqual({
      favIconUrl: 'https://example.com/favicon.ico',
      id: 'url-1',
      savedAt: 30,
      title: 'Example',
      url: 'https://example.com',
    })
  })

  it('user settingsの配列とobjectを独立コピーする', () => {
    const source = {
      activeAiSystemPromptId: 'prompt-1',
      aiSystemPrompts: [
        {
          createdAt: 1,
          id: 'prompt-1',
          name: 'Default',
          template: 'Summarize',
          updatedAt: 2,
        },
      ],
      clickBehavior: 'saveCurrentTab' as const,
      colors: { accent: '#fff' },
      confirmDeleteAll: true,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: ['chrome://*'],
      excludePinnedTabs: true,
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: false,
      removeTabAfterOpen: true,
      showSavedTime: true,
    }

    const dto = toSavedTabsUserSettingsDto(source)

    expect(dto).toStrictEqual(source)
    expect(dto.excludePatterns).not.toBe(source.excludePatterns)
    expect(dto.colors).not.toBe(source.colors)
    expect(dto.aiSystemPrompts).not.toBe(source.aiSystemPrompts)
  })
})
