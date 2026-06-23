// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CustomProject, ProjectKeywordSettings } from '@/types/storage'

import { useProjectModalState } from './useProjectModalState'
import { createProjectNameSchema } from './useProjectNameSchema'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const project: CustomProject = {
  categories: [],
  createdAt: 1,
  id: 'project-1',
  name: 'Project',
  projectKeywords: {
    domainKeywords: ['example.com'],
    titleKeywords: ['Docs'],
    urlKeywords: ['guide'],
  },
  updatedAt: 2,
}

const setup = (
  callbacks: {
    onClose?: () => void
    onDeleteProject?: (projectId: string) => Promise<void> | void
    onRenameProject?: (
      projectId: string,
      newName: string,
    ) => Promise<void> | void
    onUpdateProjectKeywords?: (
      projectId: string,
      keywords: ProjectKeywordSettings,
    ) => Promise<void> | void
  } = {},
) =>
  renderHook(() =>
    useProjectModalState(
      project,
      {
        onClose: callbacks.onClose ?? vi.fn(),
        onDeleteProject: callbacks.onDeleteProject,
        onRenameProject: callbacks.onRenameProject,
        onUpdateProjectKeywords: callbacks.onUpdateProjectKeywords,
      },
      createProjectNameSchema(),
    ),
  )

describe('useProjectModalState', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('project name の required/max/valid を検証する', () => {
    const { result } = setup()

    act(() => expect(result.current.validateProjectName('')).toBe(false))
    expect(result.current.projectNameError).toBe(
      'savedTabs.projectNameRequired',
    )
    act(() =>
      expect(result.current.validateProjectName('x'.repeat(51))).toBe(false),
    )
    expect(result.current.projectNameError).toBe(
      'savedTabs.projectNameMaxLength',
    )
    act(() => expect(result.current.validateProjectName('Valid')).toBe(true))
    expect(result.current.projectNameError).toBeNull()
  })

  it('rename 開始時に input を focus/select し、変更と cancel を反映する', () => {
    const { result } = setup()
    const input = document.createElement('input')
    const focus = vi.spyOn(input, 'focus')
    const select = vi.spyOn(input, 'select')
    result.current.inputRef.current = input
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      (callback) => {
        callback(0)
        return 1
      },
    )

    act(() => result.current.handleStartRenaming())
    expect(result.current.isRenaming).toBe(true)
    expect(focus).toHaveBeenCalled()
    expect(select).toHaveBeenCalled()
    act(() => {
      Reflect.apply(result.current.handleProjectNameChange, undefined, [
        { target: { value: 'Renamed' } },
      ])
    })
    expect(result.current.newProjectName).toBe('Renamed')
    act(() => result.current.handleCancelRenaming())
    expect(result.current.newProjectName).toBe('Project')
    expect(result.current.isRenaming).toBe(false)
  })

  it('rename/delete/keyword callbacks を呼び state を戻す', async () => {
    const onClose = vi.fn()
    const onDeleteProject = vi.fn()
    const onRenameProject = vi.fn()
    const onUpdateProjectKeywords = vi.fn()
    const { result } = setup({
      onClose,
      onDeleteProject,
      onRenameProject,
      onUpdateProjectKeywords,
    })

    await act(async () => result.current.handleSaveRenaming('Renamed'))
    expect(onRenameProject).toHaveBeenCalledWith('project-1', 'Renamed')
    expect(result.current.localProjectName).toBe('Renamed')
    await act(async () => result.current.handleSaveProjectKeywords())
    expect(onUpdateProjectKeywords).toHaveBeenCalledWith(
      'project-1',
      project.projectKeywords,
    )
    await act(async () => result.current.handleDeleteProject())
    expect(onDeleteProject).toHaveBeenCalledWith('project-1')
    expect(onClose).toHaveBeenCalled()
    expect(result.current.isProcessing).toBe(false)
  })

  it('processing 中の delete は no-op', async () => {
    const onDeleteProject = vi.fn()
    const { result } = setup({ onDeleteProject })
    act(() => result.current.updateModalState({ isProcessing: true }))

    await act(async () => result.current.handleDeleteProject())

    expect(onDeleteProject).not.toHaveBeenCalled()
  })

  it('未注入 callback の失敗を捕捉して state を戻す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = setup()

    await act(async () => result.current.handleSaveRenaming('Renamed'))
    await act(async () => result.current.handleDeleteProject())
    await act(async () => result.current.handleSaveProjectKeywords())

    expect(error).toHaveBeenCalledTimes(3)
    expect(result.current.isProcessing).toBe(false)
    expect(result.current.isSaving).toBe(false)
  })

  it('keyword の空入力と大小文字重複を追加しない', () => {
    const { result } = setup()
    const setKeywords = vi.fn()
    const clearInput = vi.fn()

    act(() =>
      result.current.addKeyword({
        clearInput,
        keyword: '  ',
        keywords: ['Docs'],
        section: 'titleKeywords',
        setKeywords,
      }),
    )
    expect(clearInput).not.toHaveBeenCalled()
    act(() =>
      result.current.addKeyword({
        clearInput,
        keyword: ' docs ',
        keywords: ['Docs'],
        section: 'titleKeywords',
        setKeywords,
      }),
    )
    expect(setKeywords).not.toHaveBeenCalled()
    expect(clearInput).toHaveBeenCalledOnce()
  })

  it.each(['domainKeywords', 'titleKeywords', 'urlKeywords'] as const)(
    '%s の追加と削除を保存する',
    async (section) => {
      const onUpdateProjectKeywords = vi.fn()
      const { result } = setup({ onUpdateProjectKeywords })
      const setKeywords = vi.fn()

      act(() =>
        result.current.addKeyword({
          clearInput: vi.fn(),
          keyword: ' new ',
          keywords: [],
          section,
          setKeywords,
        }),
      )
      act(() =>
        result.current.removeKeyword('new', section, setKeywords, ['new']),
      )

      await waitFor(() =>
        expect(onUpdateProjectKeywords).toHaveBeenCalledTimes(2),
      )
      expect(setKeywords).toHaveBeenNthCalledWith(1, ['new'])
      expect(setKeywords).toHaveBeenNthCalledWith(2, [])
    },
  )
})
