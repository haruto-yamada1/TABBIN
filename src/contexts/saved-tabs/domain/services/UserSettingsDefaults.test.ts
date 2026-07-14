import { describe, expect, it } from 'vitest'

import {
  defaultUserSettings,
  normalizeUserSettings,
} from './UserSettingsDefaults'

describe('normalizeUserSettings', () => {
  it.each([undefined, null, 'invalid', {}, { userSettings: null }])(
    '保存値が利用できない場合は既定値を返す: %j',
    (stored) => {
      const result = normalizeUserSettings(stored)

      expect(result).toMatchObject({
        excludePatternsChanged: false,
        hasLegacyKeys: false,
      })
      expect(result.normalized).toMatchObject(defaultUserSettings)
      expect(result.normalized).toHaveProperty(
        'activeAiSystemPrompt',
        defaultUserSettings.aiSystemPrompts?.[0],
      )
      expect(result.normalized).not.toBe(defaultUserSettings)
      expect(result.normalized.excludePatterns).not.toBe(
        defaultUserSettings.excludePatterns,
      )
    },
  )

  it('旧 AI 設定キーを除去し、既定値と保存値をマージする', () => {
    const result = normalizeUserSettings({
      userSettings: {
        aiChatEnabled: true,
        aiProvider: 'legacy',
        language: 'en',
        openAllInNewWindow: true,
      },
    })

    expect(result.hasLegacyKeys).toBe(true)
    expect(result.normalized.language).toBe('en')
    expect(result.normalized.openAllInNewWindow).toBe(true)
    expect(result.normalized).not.toHaveProperty('aiChatEnabled')
    expect(result.normalized).not.toHaveProperty('aiProvider')
  })

  it('未保存の外部ドロップ削除は無効にし、明示的な保存値は維持する', () => {
    expect(
      normalizeUserSettings({ userSettings: {} }).normalized
        .removeTabAfterExternalDrop,
    ).toBe(false)
    expect(
      normalizeUserSettings({
        userSettings: { removeTabAfterExternalDrop: true },
      }).normalized.removeTabAfterExternalDrop,
    ).toBe(true)
  })

  it('除外パターンを trim・重複除去し、必須パターンを補う', () => {
    const result = normalizeUserSettings({
      userSettings: {
        excludePatterns: [' example.com ', '', 'chrome://', 42, 'example.com'],
      },
    })

    expect(result.excludePatternsChanged).toBe(true)
    expect(result.normalized.excludePatterns).toStrictEqual([
      'about:',
      'chrome-extension://',
      'chrome://',
      'example.com',
    ])
  })

  it('正規化済みの除外パターンなら変更なしと判定する', () => {
    const result = normalizeUserSettings({
      userSettings: {
        excludePatterns: [...defaultUserSettings.excludePatterns],
      },
    })

    expect(result.excludePatternsChanged).toBe(false)
  })

  it('object でない userSettings は既定値へフォールバックする', () => {
    const result = normalizeUserSettings({ userSettings: 'invalid' })

    expect(result.normalized).toMatchObject(defaultUserSettings)
    expect(result.hasLegacyKeys).toBe(false)
  })

  it('colors と AI prompt をコピーして入力と参照を共有しない', () => {
    const colors = { background: '#fff' }
    const aiSystemPrompts = [
      {
        createdAt: 1,
        id: 'custom',
        name: 'Custom',
        template: 'Prompt',
        updatedAt: 2,
      },
    ]

    const result = normalizeUserSettings({
      userSettings: {
        activeAiSystemPromptId: 'custom',
        aiSystemPrompts,
        colors,
      },
    })

    expect(result.normalized.colors).toStrictEqual(colors)
    expect(result.normalized.colors).not.toBe(colors)
    expect(result.normalized.aiSystemPrompts).toContainEqual(aiSystemPrompts[0])
    expect(result.normalized.aiSystemPrompts).not.toBe(aiSystemPrompts)
    expect(result.normalized.aiSystemPrompts?.[0]).not.toBe(aiSystemPrompts[0])
  })

  it('clickBehavior が enum 外れなら default に fallback する', () => {
    const result = normalizeUserSettings({
      userSettings: {
        clickBehavior: 'invalid-behavior',
      },
    })

    expect(result.normalized.clickBehavior).toBe('saveSameDomainTabs')
  })

  it('autoDeletePeriod が enum 外れなら default に fallback する', () => {
    const result = normalizeUserSettings({
      userSettings: {
        autoDeletePeriod: 'invalid-period',
      },
    })

    expect(result.normalized.autoDeletePeriod).toBe('never')
  })

  it('boolean field が型不正なら default に fallback する', () => {
    const result = normalizeUserSettings({
      userSettings: {
        excludePinnedTabs: 'not-boolean',
        openUrlInBackground: 1,
      },
    })

    expect(result.normalized.excludePinnedTabs).toBe(true)
    expect(result.normalized.openUrlInBackground).toBe(true)
  })

  it('aiSystemPrompts の空 id preset を含む場合は default に fallback する', () => {
    const result = normalizeUserSettings({
      userSettings: {
        aiSystemPrompts: [
          { id: '', name: 'Empty', template: 't', createdAt: 0, updatedAt: 0 },
        ],
      },
    })

    expect(result.normalized.aiSystemPrompts).toBeDefined()
    expect(result.normalized.aiSystemPrompts).toHaveLength(1)
  })
})
