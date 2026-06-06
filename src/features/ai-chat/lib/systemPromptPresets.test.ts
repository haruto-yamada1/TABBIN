import { describe, expect, it } from 'vitest'

import type { UserSettings } from '@/types/storage'

import {
  DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
  DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE,
  MAX_AI_SYSTEM_PROMPT_NAME_LENGTH,
  buildFinalSystemPrompt,
  createAiSystemPromptPreset,
  getActiveAiSystemPrompt,
  normalizeAiSystemPromptSettings,
} from './systemPromptPresets'

describe('systemPromptPresets', () => {
  it('既存設定に preset が無くても default prompt を補完する', () => {
    const settings = normalizeAiSystemPromptSettings({
      ollamaModel: 'llama3.2',
    } as UserSettings)

    expect(settings.activeAiSystemPromptId).toBe(
      DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
    )
    expect(settings.aiSystemPrompts).toStrictEqual([
      expect.objectContaining({
        id: DEFAULT_AI_SYSTEM_PROMPT_PRESET_ID,
        name: 'デフォルト',
        template: DEFAULT_AI_SYSTEM_PROMPT_TEMPLATE,
      }),
    ])
    expect(settings.aiSystemPrompts?.[0]?.template).toContain(
      'あなたは TABBIN に保存されたタブの情報だけを根拠に答えるアシスタントです。',
    )
    expect(settings.aiSystemPrompts?.[0]?.template).not.toContain(
      '保存済みタブの件数:',
    )
  })

  it('active id が壊れていても先頭 preset に補正し、50件までに丸める', () => {
    const settings = normalizeAiSystemPromptSettings({
      activeAiSystemPromptId: 'missing',
      aiSystemPrompts: Array.from({ length: 55 }, (_, index) => ({
        createdAt: index,
        id: `prompt-${index + 1}`,
        name: `Prompt ${index + 1}`,
        template: `Prompt template ${index + 1}`,
        updatedAt: index,
      })),
    } as UserSettings)

    expect(settings.aiSystemPrompts).toHaveLength(50)
    expect(settings.activeAiSystemPromptId).toBe('prompt-1')
  })

  it('invalid preset を除外し、選択中 prompt は trim 後の active id で取得できる', () => {
    const settings = normalizeAiSystemPromptSettings({
      activeAiSystemPromptId: 'prompt-2',
      aiSystemPrompts: [
        null as never,
        {
          createdAt: 0,
          id: 'empty-after-trim',
          name: '   ',
          template: '   ',
          updatedAt: 0,
        },
        {
          createdAt: 0,
          id: 'empty-template-after-trim',
          name: 'Name only',
          template: '   ',
          updatedAt: 0,
        },
        {
          createdAt: 1,
          id: 'prompt-1',
          name: '  Prompt 1  ',
          template: '  template 1  ',
          updatedAt: 1,
        },
        {
          createdAt: 2,
          id: 'prompt-2',
          name: '  Prompt 2  ',
          template: '  template 2  ',
          updatedAt: 2,
        },
      ],
    } as UserSettings)

    expect(settings.aiSystemPrompts).toStrictEqual([
      expect.objectContaining({
        id: 'prompt-1',
        name: 'Prompt 1',
        template: 'template 1',
      }),
      expect.objectContaining({
        id: 'prompt-2',
        name: 'Prompt 2',
        template: 'template 2',
      }),
    ])
    expect(getActiveAiSystemPrompt(settings)).toStrictEqual(
      expect.objectContaining({
        id: 'prompt-2',
        name: 'Prompt 2',
      }),
    )
  })

  it('active id に一致がなければ先頭 preset を返す', () => {
    expect(
      getActiveAiSystemPrompt({
        activeAiSystemPromptId: 'missing',
        aiSystemPrompts: [
          {
            createdAt: 1,
            id: 'prompt-1',
            name: 'Prompt 1',
            template: 'template 1',
            updatedAt: 1,
          },
          {
            createdAt: 2,
            id: 'prompt-2',
            name: 'Prompt 2',
            template: 'template 2',
            updatedAt: 2,
          },
        ],
      }),
    ).toStrictEqual(
      expect.objectContaining({
        id: 'prompt-1',
        name: 'Prompt 1',
      }),
    )
  })

  it('prompt 名は 25 文字までに正規化する', () => {
    const settings = normalizeAiSystemPromptSettings({
      activeAiSystemPromptId: 'prompt-1',
      aiSystemPrompts: [
        {
          createdAt: 1,
          id: 'prompt-1',
          name: `  ${'a'.repeat(MAX_AI_SYSTEM_PROMPT_NAME_LENGTH + 5)}  `,
          template: 'template 1',
          updatedAt: 1,
        },
      ],
    } as UserSettings)

    expect(settings.aiSystemPrompts?.[0]?.name).toBe(
      'a'.repeat(MAX_AI_SYSTEM_PROMPT_NAME_LENGTH),
    )
  })

  it('新規 preset 作成時は UI locale から既定テンプレート言語を解決する', () => {
    globalThis.chrome = {
      i18n: {
        getUILanguage: () => 'en-US',
      },
    } as unknown as typeof chrome

    const preset = createAiSystemPromptPreset({
      id: 'prompt-1',
      name: '  English default  ',
      now: 123,
    })

    expect(preset).toStrictEqual(
      expect.objectContaining({
        createdAt: 123,
        id: 'prompt-1',
        name: 'English default',
        updatedAt: 123,
      }),
    )
    expect(preset.template).toContain('You are an assistant')
  })

  it('placeholder が無ければ保存タブ context を末尾に追加する', () => {
    const prompt = buildFinalSystemPrompt({
      savedUrlContext: '保存済みタブの件数: 3',
      template: '保存傾向だけを要約してください。',
    })

    expect(prompt).toContain('保存傾向だけを要約してください。')
    expect(prompt).toContain('保存済みタブの件数: 3')
    expect(prompt.indexOf('保存傾向だけを要約してください。')).toBeLessThan(
      prompt.indexOf('保存済みタブの件数: 3'),
    )
  })

  it('placeholder があればその位置に保存タブ context を差し込む', () => {
    const prompt = buildFinalSystemPrompt({
      savedUrlContext: '保存済みタブの件数: 5',
      template: [
        '最初に背景を読むこと。',
        '{{saved_url_context}}',
        'その後に日本語で答えること。',
      ].join('\n'),
    })

    expect(prompt).toContain('最初に背景を読むこと。')
    expect(prompt).toContain('保存済みタブの件数: 5')
    expect(prompt).toContain('その後に日本語で答えること。')
    expect(prompt).not.toContain('{{saved_url_context}}')
  })
})
