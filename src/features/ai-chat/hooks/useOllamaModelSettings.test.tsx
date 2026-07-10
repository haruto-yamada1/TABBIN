// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultSettings } from '@/lib/storage/settings'
import type { OllamaErrorDetails } from '@/types/background'
import type { UserSettings } from '@/types/storage'

const mocked = vi.hoisted(() => ({
  getRuntimePlatform: vi.fn(),
  requestOllamaModels: vi.fn(),
  saveUserSettings: vi.fn(),
}))

vi.mock('@/features/ai-chat/components/savedTabsChat/streaming', () => ({
  getRuntimePlatform: mocked.getRuntimePlatform,
  requestOllamaModels: mocked.requestOllamaModels,
}))

vi.mock('@/lib/storage/settings', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/lib/storage/settings',
  )
  return {
    ...actual,
    saveUserSettings: mocked.saveUserSettings,
  }
})

import { useOllamaModelSettings } from './useOllamaModelSettings'

const settings: UserSettings = {
  ...defaultSettings,
  ollamaModel: '',
}

const translations: Record<string, string> = {
  'aiChat.modelListLoadError': 'Could not load the model list',
  'aiChat.modelSettingsSaveError': 'Could not save model settings',
}
const t = (key: string) => translations[key] ?? key

const createDeferred = <T,>() => {
  let resolveDeferred: (value: T) => void = () => {}
  let rejectDeferred: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve
    rejectDeferred = reject
  })
  return {
    promise,
    reject: rejectDeferred,
    resolve: resolveDeferred,
  }
}

describe('useOllamaModelSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getRuntimePlatform.mockResolvedValue('unknown')
    mocked.saveUserSettings.mockResolvedValue(undefined)
  })

  it('取得中を表示し、取得したモデルを selector option へ変換する', async () => {
    const deferred = createDeferred<{
      models: { label: string; name: string }[]
      status: 'ok'
    }>()
    mocked.requestOllamaModels.mockReturnValue(deferred.promise)
    const { result } = renderHook(() =>
      useOllamaModelSettings({ onSettingsSaved: vi.fn(), settings, t }),
    )

    let requestPromise: Promise<void> = Promise.resolve()
    act(() => {
      requestPromise = result.current.requestModels()
    })
    expect(result.current.isLoadingModels).toBe(true)

    await act(async () => {
      deferred.resolve({
        models: [{ label: 'Llama 3.2 (8B)', name: 'llama3.2' }],
        status: 'ok',
      })
      await requestPromise
    })

    expect(result.current.modelOptions).toEqual([
      { label: 'Llama 3.2 (8B)', name: 'llama3.2' },
    ])
    expect(result.current.isLoadingModels).toBe(false)
    expect(result.current.setupErrorMessage).toBe('')
  })

  it('モデル取得失敗時は一覧を消去して API の error と診断詳細を保持する', async () => {
    const ollamaError: OllamaErrorDetails = {
      allowedOrigins: 'chrome-extension://extension-id',
      baseUrl: 'http://localhost:11434',
      downloadUrl: 'https://ollama.com/download',
      faqUrl: 'https://docs.ollama.com/faq',
      kind: 'notInstalledOrNotRunning',
      tagsUrl: 'http://localhost:11434/api/tags',
    }
    mocked.requestOllamaModels
      .mockResolvedValueOnce({
        models: [{ label: 'Llama', name: 'llama' }],
        status: 'ok',
      })
      .mockResolvedValueOnce({
        error: 'Could not connect to Ollama.',
        ollamaError,
        status: 'error',
      })
    const { result } = renderHook(() =>
      useOllamaModelSettings({ onSettingsSaved: vi.fn(), settings, t }),
    )

    await act(async () => {
      await result.current.requestModels()
    })
    await act(async () => {
      await result.current.requestModels()
    })

    expect(result.current.modelOptions).toEqual([])
    expect(result.current.setupErrorMessage).toBe(
      'Could not connect to Ollama.',
    )
    expect(result.current.setupOllamaError).toEqual(ollamaError)
  })

  it('モデル取得結果が不正な場合は既定の error 文言を使う', async () => {
    mocked.requestOllamaModels.mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useOllamaModelSettings({ onSettingsSaved: vi.fn(), settings, t }),
    )

    await act(async () => {
      await result.current.requestModels()
    })

    expect(result.current.setupErrorMessage).toBe(
      'Could not load the model list',
    )
  })

  it('保存中を表示し、正規化した次設定を保存して owner へ通知する', async () => {
    const deferred = createDeferred<undefined>()
    mocked.saveUserSettings.mockReturnValue(deferred.promise)
    const onSettingsSaved = vi.fn()
    const { result } = renderHook(() =>
      useOllamaModelSettings({ onSettingsSaved, settings, t }),
    )

    let savePromise: Promise<boolean> = Promise.resolve(false)
    act(() => {
      savePromise = result.current.selectModel('qwen3:latest')
    })
    expect(result.current.isSavingModel).toBe(true)

    await act(async () => {
      deferred.resolve(undefined)
      await expect(savePromise).resolves.toBe(true)
    })

    const savedSettings = mocked.saveUserSettings.mock.calls[0][0]
    expect(savedSettings).toEqual(
      expect.objectContaining({ ollamaModel: 'qwen3:latest' }),
    )
    expect(onSettingsSaved).toHaveBeenCalledWith(savedSettings)
    expect(result.current.isSavingModel).toBe(false)
  })

  it('保存失敗時は owner へ通知せず error を返す', async () => {
    mocked.saveUserSettings.mockRejectedValue(new Error('storage failed'))
    const onSettingsSaved = vi.fn()
    const { result } = renderHook(() =>
      useOllamaModelSettings({ onSettingsSaved, settings, t }),
    )

    await act(async () => {
      await expect(result.current.selectModel('llama3.2')).resolves.toBe(false)
    })

    expect(onSettingsSaved).not.toHaveBeenCalled()
    expect(result.current.setupErrorMessage).toBe(
      'Could not save model settings',
    )
    expect(result.current.isSavingModel).toBe(false)
  })

  it('pending save 完了時は rerender 後の最新 callback だけへ通知する', async () => {
    const deferred = createDeferred<undefined>()
    mocked.saveUserSettings.mockReturnValue(deferred.promise)
    const oldCallback = vi.fn()
    const latestCallback = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)
    const latestRenderCommitted = createDeferred<undefined>()
    let selectModel: (modelName: string) => Promise<boolean> = async () => false
    const HookHarness = ({
      onCommit,
      onSettingsSaved,
    }: {
      onCommit?: () => void
      onSettingsSaved: (nextSettings: UserSettings) => void
    }) => {
      selectModel = useOllamaModelSettings({
        onSettingsSaved,
        settings,
        t,
      }).selectModel
      useLayoutEffect(() => {
        onCommit?.()
      }, [onCommit])
      return null
    }
    await act(async () => {
      root.render(<HookHarness onSettingsSaved={oldCallback} />)
    })
    const savePromise = selectModel('qwen3')

    root.render(
      <HookHarness
        onCommit={() => latestRenderCommitted.resolve(undefined)}
        onSettingsSaved={latestCallback}
      />,
    )
    await latestRenderCommitted.promise
    deferred.resolve(undefined)
    await savePromise

    expect(oldCallback).not.toHaveBeenCalled()
    expect(latestCallback).toHaveBeenCalledOnce()
    await act(async () => {
      root.unmount()
    })
  })

  it('同一 hook で進行中の取得と保存を重複実行しない', async () => {
    const fetchDeferred = createDeferred<undefined>()
    const saveDeferred = createDeferred<undefined>()
    mocked.requestOllamaModels.mockReturnValue(fetchDeferred.promise)
    mocked.saveUserSettings.mockReturnValue(saveDeferred.promise)
    const { result } = renderHook(() =>
      useOllamaModelSettings({ onSettingsSaved: vi.fn(), settings, t }),
    )

    let firstFetch: Promise<void> = Promise.resolve()
    let secondFetch: Promise<void> = Promise.resolve()
    let firstSave: Promise<boolean> = Promise.resolve(false)
    let secondSave: Promise<boolean> = Promise.resolve(true)
    act(() => {
      firstFetch = result.current.requestModels()
      secondFetch = result.current.requestModels()
      firstSave = result.current.selectModel('llama3.2')
      secondSave = result.current.selectModel('qwen3')
    })

    expect(mocked.requestOllamaModels).toHaveBeenCalledOnce()
    expect(mocked.saveUserSettings).toHaveBeenCalledOnce()
    await expect(secondSave).resolves.toBe(false)

    await act(async () => {
      fetchDeferred.resolve(undefined)
      saveDeferred.resolve(undefined)
      await Promise.all([firstFetch, secondFetch, firstSave])
    })
  })

  it.each([
    ['mac', 'macos'],
    ['win', 'windows'],
  ] as const)(
    'runtime platform %s を %s guidance 用に公開する',
    async (os, _guidance) => {
      mocked.getRuntimePlatform.mockResolvedValue(os)
      const { result } = renderHook(() =>
        useOllamaModelSettings({ onSettingsSaved: vi.fn(), settings, t }),
      )

      await act(async () => {
        await mocked.getRuntimePlatform.mock.results[0].value
      })

      expect(result.current.platform).toBe(os)
    },
  )

  it('unmount 後に pending 操作が完了しても owner と hook state を更新しない', async () => {
    const fetchDeferred = createDeferred<undefined>()
    const saveDeferred = createDeferred<undefined>()
    mocked.requestOllamaModels.mockReturnValue(fetchDeferred.promise)
    mocked.saveUserSettings.mockReturnValue(saveDeferred.promise)
    const onSettingsSaved = vi.fn()
    const { result, unmount } = renderHook(() =>
      useOllamaModelSettings({ onSettingsSaved, settings, t }),
    )
    const requestPromise = result.current.requestModels()
    const savePromise = result.current.selectModel('llama3.2')

    unmount()
    fetchDeferred.resolve(undefined)
    saveDeferred.resolve(undefined)
    await Promise.all([requestPromise, savePromise])

    expect(onSettingsSaved).not.toHaveBeenCalled()
  })
})
