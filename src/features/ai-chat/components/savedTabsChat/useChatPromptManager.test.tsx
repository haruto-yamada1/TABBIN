// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getActiveAiSystemPrompt,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import {
  defaultSettings,
  requireUserSettings,
  saveUserSettings,
} from '@/lib/storage/settings'
import { aiSystemPromptPresetSchema } from '@/lib/storage/zod-storage'
import type { UserSettings } from '@/types/storage'

import { useChatPromptManager } from './useChatPromptManager'

vi.mock('@/lib/storage/settings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}))

const displaySettings = normalizeAiSystemPromptSettings(defaultSettings)
const t = (key: string) => key

const useManager = (resolvedSettings: UserSettings = displaySettings) =>
  useChatPromptManager({
    resolvedSettings,
    activeSystemPrompt: getActiveAiSystemPrompt(displaySettings),
    language: 'en',
    t,
    handleResetConversation: vi.fn(),
    onSettingsChange: vi.fn(),
  })

describe('プロンプト設定の安全な保存', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(saveUserSettings).mockResolvedValue(undefined)
  })

  it('最新設定を保持してプロンプト所有のフィールドだけを変更する', async () => {
    vi.mocked(requireUserSettings).mockResolvedValue({
      ...displaySettings,
      removeTabAfterOpen: false,
      excludePatterns: ['https://private.example/*'],
      ollamaModel: 'stored-model',
    })
    const { result } = renderHook(useManager)
    act(() => result.current.handleOpenSystemPromptManager())
    act(() => result.current.handleChangePromptName('Updated name'))
    await act(async () => result.current.handleSavePromptManager())
    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        removeTabAfterOpen: false,
        excludePatterns: ['https://private.example/*'],
        ollamaModel: 'stored-model',
        aiSystemPrompts: expect.arrayContaining([
          expect.objectContaining({ name: 'Updated name' }),
        ]),
      }),
    )
  })

  it('保存schemaによるキー順の変更だけなら下書きを失わず保存する', async () => {
    vi.mocked(requireUserSettings).mockResolvedValue({
      ...displaySettings,
      aiSystemPrompts: displaySettings.aiSystemPrompts.map((prompt) =>
        aiSystemPromptPresetSchema.parse(prompt),
      ),
    })
    const { result } = renderHook(useManager)
    act(() => result.current.handleOpenSystemPromptManager())
    act(() => result.current.handleChangePromptName('Keep this draft'))
    await act(async () => result.current.handleSavePromptManager())

    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiSystemPrompts: expect.arrayContaining([
          expect.objectContaining({ name: 'Keep this draft' }),
        ]),
      }),
    )
    expect(result.current.promptManagerError).toBe('')
    expect(result.current.isPromptManagerOpen).toBe(false)
  })

  it('未設定の一覧は空のsnapshotと同じと扱い最初のpresetを保存する', async () => {
    const initial = { ...displaySettings, aiSystemPrompts: undefined }
    vi.mocked(requireUserSettings).mockResolvedValue(initial)
    const { result } = renderHook(() => useManager(initial))
    act(() => result.current.handleOpenSystemPromptManager())
    act(() => result.current.handleCreatePrompt())
    act(() => result.current.handleChangePromptName('First preset'))
    act(() => result.current.handleChangePromptTemplate('First template'))
    await act(async () => result.current.handleSavePromptManager())

    expect(saveUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        aiSystemPrompts: [
          expect.objectContaining({
            name: 'First preset',
            template: 'First template',
          }),
        ],
      }),
    )
  })

  it.each([
    { id: 'external-id' },
    { name: 'External name' },
    { template: 'External template' },
    { createdAt: 1 },
    { updatedAt: 1 },
  ])('保存済みpresetのfield変更%jは競合として保護する', async (patch) => {
    const currentPrompts = displaySettings.aiSystemPrompts.map((prompt) => ({
      ...prompt,
      ...patch,
    }))
    vi.mocked(requireUserSettings).mockResolvedValue({
      ...displaySettings,
      aiSystemPrompts: currentPrompts,
    })
    const { result } = renderHook(useManager)
    act(() => result.current.handleOpenSystemPromptManager())
    act(() => result.current.handleChangePromptName('Stale draft'))
    await act(async () => result.current.handleSavePromptManager())

    expect(saveUserSettings).not.toHaveBeenCalled()
    expect(result.current.promptDrafts).toEqual(currentPrompts)
    expect(result.current.promptManagerError).toBe(
      'aiChat.systemPrompt.reloadRequired',
    )
  })

  it.each(['remove', 'append', 'reorder'] as const)(
    '保存済みpresetの配列変更%sは競合として保護する',
    async (change) => {
      const first = displaySettings.aiSystemPrompts[0]
      const second = { ...first, id: 'second', name: 'Second preset' }
      const initial = {
        ...displaySettings,
        aiSystemPrompts: [first, second],
      }
      const currentPrompts = {
        remove: [first],
        append: [first, second, { ...second, id: 'third' }],
        reorder: [second, first],
      }[change]
      vi.mocked(requireUserSettings).mockResolvedValue({
        ...displaySettings,
        aiSystemPrompts: currentPrompts,
      })
      const { result } = renderHook(() => useManager(initial))
      act(() => result.current.handleOpenSystemPromptManager())
      act(() => result.current.handleChangePromptName('Stale draft'))
      await act(async () => result.current.handleSavePromptManager())

      expect(saveUserSettings).not.toHaveBeenCalled()
      expect(result.current.promptDrafts).toEqual(currentPrompts)
    },
  )

  it('表示fallbackに存在しない保存済みプロンプトを上書きせず再表示する', async () => {
    const storedPrompt = {
      id: 'private-stored-prompt',
      name: 'Stored preset',
      template: 'Stored prompt',
      createdAt: 1,
      updatedAt: 1,
    }
    vi.mocked(requireUserSettings).mockResolvedValue({
      ...displaySettings,
      activeAiSystemPromptId: storedPrompt.id,
      aiSystemPrompts: [storedPrompt],
    })
    const { result } = renderHook(useManager)
    act(() => result.current.handleOpenSystemPromptManager())
    act(() => result.current.handleChangePromptName('Fallback edit'))
    await act(async () => result.current.handleSavePromptManager())
    expect(saveUserSettings).not.toHaveBeenCalled()
    expect(result.current.promptDrafts).toEqual([storedPrompt])
    expect(result.current.isPromptManagerOpen).toBe(true)
  })

  it('編集中の外部更新でもdialog開始時点のsnapshotからの上書きを止める', async () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useManager>,
      UserSettings
    >(useManager, {
      initialProps: displaySettings,
    })
    act(() => result.current.handleOpenSystemPromptManager())
    act(() => result.current.handleChangePromptName('Old draft'))
    const latest = {
      ...displaySettings,
      aiSystemPrompts: (displaySettings.aiSystemPrompts ?? []).map(
        (prompt) => ({ ...prompt, name: 'External edit' }),
      ),
    }
    rerender(latest)
    vi.mocked(requireUserSettings).mockResolvedValue(latest)
    await act(async () => result.current.handleSavePromptManager())
    expect(saveUserSettings).not.toHaveBeenCalled()
    expect(result.current.promptDrafts).toEqual(latest.aiSystemPrompts)
  })

  it('最新設定が読めなければプロンプト設定を書き込まない', async () => {
    vi.mocked(requireUserSettings).mockRejectedValue(new Error('unavailable'))
    const { result } = renderHook(useManager)
    act(() => result.current.handleOpenSystemPromptManager())
    await act(async () => result.current.handleSavePromptManager())
    expect(saveUserSettings).not.toHaveBeenCalled()
    expect(result.current.promptManagerError).toBe(
      'aiChat.systemPrompt.saveError',
    )
  })
})
