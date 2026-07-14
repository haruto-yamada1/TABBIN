/* eslint-disable max-lines-per-function */
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line
import { z } from 'zod'

import {
  aiSystemPromptPresetSchema,
  fromStorageChange,
  parseStoredUserSettings,
  safeParseArrayFromStorage,
  storedUserSettingsSchema,
  TabGroupSchema,
  UserSettingsSchema,
} from './zod-storage'

const ItemSchema = z.object({
  id: z.string(),
  value: z.number(),
})

describe('zod-storage helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('fromStorageChange', () => {
    it('正常値はスキーマに従い変換して返す', () => {
      const result = fromStorageChange(ItemSchema, { id: 'a', value: 1 })
      expect(result).toStrictEqual({ id: 'a', value: 1 })
    })

    it('不正値は例外を投げる', () => {
      expect(() =>
        fromStorageChange(ItemSchema, { id: 'a', value: 'not-number' }),
      ).toThrow(/expected number/)
    })
  })

  describe('safeParseArrayFromStorage', () => {
    it('正常値だけの配列は全要素を返す', () => {
      const result = safeParseArrayFromStorage(ItemSchema, [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ])
      expect(result).toStrictEqual([
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ])
    })

    it('不正な要素はスキップし、正常要素だけ返す', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = safeParseArrayFromStorage(ItemSchema, [
        { id: 'a', value: 1 },
        { id: 'b' }, // value 欠損
        { id: 'c', value: 'not-number' }, // value 型不正
        { id: 'd', value: 4 },
      ])
      expect(result).toStrictEqual([
        { id: 'a', value: 1 },
        { id: 'd', value: 4 },
      ])
      expect(warnSpy).toHaveBeenCalledTimes(2)
    })

    it('空配列は空配列を返す', () => {
      expect(safeParseArrayFromStorage(ItemSchema, [])).toStrictEqual([])
    })

    it('配列でない値は空配列を返す', () => {
      expect(safeParseArrayFromStorage(ItemSchema, null)).toStrictEqual([])
      expect(
        safeParseArrayFromStorage(ItemSchema, { invalid: true }),
      ).toStrictEqual([])
      expect(safeParseArrayFromStorage(ItemSchema, 'not-array')).toStrictEqual(
        [],
      )
    })

    it('TabGroupSchema で壊れた1件を含む配列でも正常分は保持される', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const valid = {
        id: 'group-1',
        domain: 'https://example.com',
        urlIds: ['url-1'],
      }
      const result = safeParseArrayFromStorage(TabGroupSchema, [
        valid,
        { id: 'broken' }, // domain 欠損
        valid,
      ])
      expect(result).toHaveLength(2)
      expect(result[0]).toStrictEqual(valid)
      expect(result[1]).toStrictEqual(valid)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('UserSettingsSchema', () => {
    it('autoDeletePeriod の enum 外れ値を拒否する', () => {
      const result = UserSettingsSchema.safeParse({
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: false,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveSameDomainTabs',
        excludePinnedTabs: true,
        openUrlInBackground: true,
        openAllInNewWindow: false,
        confirmDeleteAll: false,
        confirmDeleteEach: false,
        autoDeletePeriod: 'invalid-period',
      })
      expect(result.success).toBe(false)
    })

    it('autoDeletePeriod の有効値を受け付ける', () => {
      const result = UserSettingsSchema.safeParse({
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: false,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveSameDomainTabs',
        excludePinnedTabs: true,
        openUrlInBackground: true,
        openAllInNewWindow: false,
        confirmDeleteAll: false,
        confirmDeleteEach: false,
        autoDeletePeriod: '30days',
      })
      expect(result.success).toBe(true)
      if (!result.success) {
        return
      }
      expect(result.data.autoDeletePeriod).toBe('30days')
    })
  })

  describe('aiSystemPromptPresetSchema', () => {
    it('id が空文字なら拒否する', () => {
      const result = aiSystemPromptPresetSchema.safeParse({
        id: '',
        name: 'preset',
        template: 'template',
        createdAt: 0,
        updatedAt: 0,
      })
      expect(result.success).toBe(false)
    })

    it('name が空文字なら拒否する', () => {
      const result = aiSystemPromptPresetSchema.safeParse({
        id: 'preset-1',
        name: '',
        template: 'template',
        createdAt: 0,
        updatedAt: 0,
      })
      expect(result.success).toBe(false)
    })

    it('有効な preset を受け付ける', () => {
      const result = aiSystemPromptPresetSchema.safeParse({
        id: 'preset-1',
        name: 'My Preset',
        template: 'You are helpful.',
        createdAt: 1,
        updatedAt: 2,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('parseStoredUserSettings', () => {
    it('有効な設定はそのまま返す', () => {
      const result = parseStoredUserSettings({
        language: 'en',
        removeTabAfterOpen: false,
        excludePatterns: ['chrome://'],
        enableCategories: false,
        showSavedTime: true,
        clickBehavior: 'saveCurrentTab',
        excludePinnedTabs: false,
        openUrlInBackground: false,
        openAllInNewWindow: true,
        confirmDeleteAll: true,
        confirmDeleteEach: true,
        autoDeletePeriod: '7days',
      })
      expect(result.language).toBe('en')
      expect(result.removeTabAfterOpen).toBe(false)
      expect(result.clickBehavior).toBe('saveCurrentTab')
      expect(result.autoDeletePeriod).toBe('7days')
    })

    it('型不正の boolean field は除外される', () => {
      const result = parseStoredUserSettings({
        removeTabAfterOpen: 'not-boolean',
        clickBehavior: 'saveSameDomainTabs',
      })
      expect(result.removeTabAfterOpen).toBeUndefined()
      expect(result.clickBehavior).toBe('saveSameDomainTabs')
    })

    it('enum 外れの clickBehavior は除外される', () => {
      const result = parseStoredUserSettings({
        clickBehavior: 'invalid-behavior',
      })
      expect(result.clickBehavior).toBeUndefined()
    })

    it('enum 外れの autoDeletePeriod は除外される', () => {
      const result = parseStoredUserSettings({
        autoDeletePeriod: 'invalid-period',
      })
      expect(result.autoDeletePeriod).toBeUndefined()
    })

    it('enum 外れの language は除外される', () => {
      const result = parseStoredUserSettings({
        language: 'fr',
      })
      expect(result.language).toBeUndefined()
    })

    it('excludePatterns 内の非文字列要素は除外され、文字列は保持される', () => {
      const result = parseStoredUserSettings({
        excludePatterns: ['custom', 123, null, 'chrome://'],
      })
      expect(result.excludePatterns).toStrictEqual(['custom', 'chrome://'])
    })

    it('excludePatterns が配列でなければ除外される', () => {
      const result = parseStoredUserSettings({
        excludePatterns: 'not-an-array',
      })
      expect(result.excludePatterns).toBeUndefined()
    })

    it('aiSystemPrompts 内の空 id preset を含む場合は配列全体が除外される', () => {
      const result = parseStoredUserSettings({
        aiSystemPrompts: [
          {
            id: 'valid',
            name: 'Valid',
            template: 't',
            createdAt: 0,
            updatedAt: 0,
          },
          { id: '', name: 'Empty', template: 't', createdAt: 0, updatedAt: 0 },
        ],
      })
      expect(result.aiSystemPrompts).toBeUndefined()
    })

    it('colors の値が文字列でなければ除外される', () => {
      const result = parseStoredUserSettings({
        colors: { bg: 123 },
      })
      expect(result.colors).toBeUndefined()
    })

    it('fontSizePercent が数値でなければ除外される', () => {
      const result = parseStoredUserSettings({
        fontSizePercent: '100',
      })
      expect(result.fontSizePercent).toBeUndefined()
    })

    it('入力がオブジェクトでなければ空 object を返す', () => {
      expect(parseStoredUserSettings('not-object')).toStrictEqual({})
      expect(parseStoredUserSettings(null)).toStrictEqual({})
      expect(parseStoredUserSettings(123)).toStrictEqual({})
    })

    it('全 field が不正な場合は空 object を返す', () => {
      const result = parseStoredUserSettings({
        language: 123,
        removeTabAfterOpen: 'bad',
        clickBehavior: 'bad',
        autoDeletePeriod: 'bad',
        fontSizePercent: 'bad',
        colors: 'bad',
        aiSystemPrompts: 'bad',
      })
      expect(result).toStrictEqual({})
    })
  })

  describe('storedUserSettingsSchema', () => {
    it('全 field optional で部分設定を受け付ける', () => {
      const result = storedUserSettingsSchema.safeParse({
        language: 'ja',
      })
      expect(result.success).toBe(true)
      if (!result.success) {
        return
      }
      expect(result.data.language).toBe('ja')
    })
  })
})
