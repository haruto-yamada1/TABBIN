import { describe, expect, it } from 'vitest'

import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { createUrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'

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
      urlIds: ['url-1'],
    })
    const category = createParentCategory({
      domainNames: ['example.com'],
      domains: ['group-1'],
      id: 'category-1',
      name: 'Docs',
    })
    const group = createTabGroup({
      categoryKeywords: [{ categoryName: 'docs', keywords: ['guide'] }],
      domain: 'example.com',
      id: 'group-1',
      parentCategoryId: 'category-1',
      savedAt: 30,
      subCategories: ['docs'],
      subCategoryOrder: ['docs'],
      subCategoryOrderWithUncategorized: ['docs', 'uncategorized'],
      urlIds: ['url-1'],
      urlSubCategories: { 'url-1': 'docs' },
    })
    const record = createUrlRecord({
      favIconUrl: 'https://example.com/favicon.ico',
      id: 'url-1',
      savedAt: 30,
      title: 'Example',
      url: 'https://example.com',
    })

    expect(toSavedTabsCustomProjectDto(project)).toStrictEqual({
      categories: ['research'],
      createdAt: 10,
      id: 'project-1',
      name: 'Research',
      updatedAt: 20,
      urlIds: ['url-1'],
    })
    expect(toSavedTabsParentCategoryDto(category)).toStrictEqual({
      domainNames: ['example.com'],
      domains: ['group-1'],
      id: 'category-1',
      name: 'Docs',
    })
    expect(toSavedTabsTabGroupDto(group)).toStrictEqual({
      categoryKeywords: [{ categoryName: 'docs', keywords: ['guide'] }],
      domain: 'example.com',
      id: 'group-1',
      parentCategoryId: 'category-1',
      savedAt: 30,
      subCategories: ['docs'],
      subCategoryOrder: ['docs'],
      subCategoryOrderWithUncategorized: ['docs', 'uncategorized'],
      urlIds: ['url-1'],
      urlSubCategories: { 'url-1': 'docs' },
    })
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
