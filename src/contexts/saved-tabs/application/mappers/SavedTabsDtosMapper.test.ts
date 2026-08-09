import { describe, expect, it } from 'vitest'

import {
  toDomainCategoryMappingDtoArray,
  toStorageDomainCategoryMappings,
  toStorageUserSettings,
  toUserSettingsDto,
} from './SavedTabsDtosMapper'

describe('SavedTabsDtosMapper.toUserSettingsDto', () => {
  it('storage 形 UserSettings を全フィールド保ったまま DTO へ変換する', () => {
    const storage = {
      activeAiSystemPromptId: 'preset-1',
      aiSystemPrompts: [
        {
          createdAt: 1,
          id: 'preset-1',
          name: 'Default',
          template: 'tmpl',
          updatedAt: 2,
        },
      ],
      autoDeletePeriod: 'never',
      clickBehavior: 'saveSameDomainTabs' as const,
      colors: { key: 'value' },
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: ['about:', 'chrome://'],
      excludePinnedTabs: true,
      fontSizePercent: 100,
      language: 'ja' as const,
      ollamaModel: 'llama3',
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: true,
      removeTabAfterOpen: true,
      showSavedTime: false,
    }
    const dto = toUserSettingsDto(storage)
    expect(dto).toStrictEqual(storage)
  })

  it('excludePatterns / colors などのオブジェクト/配列を保持する', () => {
    const dto = toUserSettingsDto({
      clickBehavior: 'saveCurrentTab',
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: false,
      excludePatterns: ['about:'],
      excludePinnedTabs: false,
      openAllInNewWindow: false,
      openUrlInBackground: false,
      removeTabAfterExternalDrop: false,
      removeTabAfterOpen: false,
      showSavedTime: false,
    })
    expect(dto.excludePatterns).toStrictEqual(['about:'])
  })
})

describe('SavedTabsDtosMapper.toStorageUserSettings', () => {
  it('DTO を storage 形へ逆変換し、配列は新規インスタンスになる', () => {
    const original = {
      clickBehavior: 'saveAllWindowsTabs' as const,
      confirmDeleteAll: true,
      confirmDeleteEach: true,
      enableCategories: true,
      excludePatterns: ['chrome://'],
      excludePinnedTabs: true,
      openAllInNewWindow: true,
      openUrlInBackground: false,
      removeTabAfterExternalDrop: false,
      removeTabAfterOpen: true,
      showSavedTime: true,
    }
    const dto = toUserSettingsDto(original)
    const storage = toStorageUserSettings(dto)
    expect(storage).toStrictEqual(original)
    // excludePatterns は新規配列
    expect(storage.excludePatterns).not.toBe(original.excludePatterns)
  })

  it('aiSystemPrompts / colors が undefined の場合は undefined 維持', () => {
    const storage = toStorageUserSettings({
      clickBehavior: 'saveCurrentTab',
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: false,
      excludePatterns: [],
      excludePinnedTabs: false,
      openAllInNewWindow: false,
      openUrlInBackground: false,
      removeTabAfterExternalDrop: false,
      removeTabAfterOpen: false,
      showSavedTime: false,
    })
    expect(storage.aiSystemPrompts).toBeUndefined()
    expect(storage.colors).toBeUndefined()
  })
})

describe('SavedTabsDtosMapper.toDomainCategoryMappingDtoArray', () => {
  it('storage 形 DomainParentCategoryMapping[] を DTO 配列へ変換する', () => {
    const result = toDomainCategoryMappingDtoArray([
      { categoryId: 'cat-1', domain: 'example.com' },
      { categoryId: 'cat-2', domain: 'other.com' },
    ])
    expect(result).toStrictEqual([
      { categoryId: 'cat-1', domain: 'example.com' },
      { categoryId: 'cat-2', domain: 'other.com' },
    ])
  })

  it('空配列を渡しても例外を出さない', () => {
    expect(toDomainCategoryMappingDtoArray([])).toStrictEqual([])
  })
})

describe('SavedTabsDtosMapper.toStorageDomainCategoryMappings', () => {
  it('DTO 配列を storage 形配列へ逆変換する', () => {
    const result = toStorageDomainCategoryMappings([
      { categoryId: 'cat-1', domain: 'example.com' },
    ])
    expect(result).toStrictEqual([
      { categoryId: 'cat-1', domain: 'example.com' },
    ])
  })
})

describe('SavedTabsDtosMapper round-trip', () => {
  it('toStorageUserSettings は全optional fieldを復元する', () => {
    const result = toStorageUserSettings({
      activeAiSystemPromptId: 'preset-1',
      aiSystemPrompts: [
        {
          createdAt: 1,
          id: 'preset-1',
          name: 'Default',
          template: 'template',
          updatedAt: 2,
        },
      ],
      autoDeletePeriod: 'never',
      clickBehavior: 'saveCurrentTab',
      colors: { accent: '#fff' },
      confirmDeleteAll: true,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: [],
      excludePinnedTabs: false,
      fontSizePercent: 110,
      language: 'en',
      ollamaModel: 'model',
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: false,
      removeTabAfterOpen: true,
      showSavedTime: true,
    })

    expect(result).toMatchObject({
      activeAiSystemPromptId: 'preset-1',
      autoDeletePeriod: 'never',
      colors: { accent: '#fff' },
      fontSizePercent: 110,
      language: 'en',
      ollamaModel: 'model',
    })
    expect(result.aiSystemPrompts).toStrictEqual([
      {
        createdAt: 1,
        id: 'preset-1',
        name: 'Default',
        template: 'template',
        updatedAt: 2,
      },
    ])
  })

  it('toUserSettingsDto → toStorageUserSettings は元の storage 形と等価', () => {
    const original = {
      clickBehavior: 'saveWindowTabs' as const,
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: ['about:'],
      excludePinnedTabs: false,
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: true,
      removeTabAfterOpen: true,
      showSavedTime: false,
    }
    expect(toStorageUserSettings(toUserSettingsDto(original))).toStrictEqual(
      original,
    )
  })

  it('DomainCategoryMappingDto の round-trip は元の storage 形と等価', () => {
    const original = [
      { categoryId: 'cat-1', domain: 'a.example.com' },
      { categoryId: 'cat-2', domain: 'b.example.com' },
    ]
    expect(
      toStorageDomainCategoryMappings(
        toDomainCategoryMappingDtoArray(original),
      ),
    ).toStrictEqual(original)
  })
})
