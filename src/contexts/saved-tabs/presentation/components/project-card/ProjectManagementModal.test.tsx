// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
// eslint-disable-next-line eslint/no-unused-vars
import { dirname, resolve } from 'node:path'
// eslint-disable-next-line eslint/no-unused-vars
import { fileURLToPath } from 'node:url'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

const projectManagementModalI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
  }) => (
    <div data-testid='dialog-root'>
      <button onClick={() => onOpenChange?.(false)} type='button'>
        dialog-close
      </button>
      {open ? children : null}
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: projectManagementModalI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(projectManagementModalI18nState.language)
        const template =
          messages[key as keyof typeof messages] ?? fallback ?? key
        return template.replaceAll(
          /\{\{(\w+)\}\}/g,
          (_, token) => values?.[token] ?? '', // eslint-disable-line
        )
      },
    }),
  }
})

import { ProjectManagementModal } from './ProjectManagementModal'

const project: CustomProject = {
  id: 'project-1',
  name: 'Project Alpha',
  projectKeywords: {
    titleKeywords: ['urgent'],
    urlKeywords: ['docs'],
    domainKeywords: ['example.com'],
  },
  categories: [],
  createdAt: 1,
  updatedAt: 1,
}

const uncategorizedProject: CustomProject = {
  id: 'custom-uncategorized',
  name: '未分類',
  projectKeywords: {
    titleKeywords: [],
    urlKeywords: [],
    domainKeywords: [],
  },
  categories: [],
  createdAt: 1,
  updatedAt: 1,
}

describe('ProjectManagementModal', () => {
  const requestAnimationFrameCallbacks: FrameRequestCallback[] = []

  const flushAnimationFrames = () => {
    const callbacks = requestAnimationFrameCallbacks.splice(0)
    callbacks.forEach((callback) => {
      callback(0)
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    projectManagementModalI18nState.language = 'ja'
    requestAnimationFrameCallbacks.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(HTMLInputElement.prototype, 'focus').mockImplementation(() => {})
    vi.spyOn(HTMLInputElement.prototype, 'select').mockImplementation(() => {})
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      requestAnimationFrameCallbacks.push(callback)
      return 1
    })
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'complete',
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shared ui button を使い、生の button 要素を残さない', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, './ProjectManagementModal.tsx'),
      'utf8',
    )

    expect(source).not.toContain('<button')
  })

  it('閉じているときは何も描画しない', () => {
    const { container } = render(
      <ProjectManagementModal
        isOpen={false}
        onClose={vi.fn()}
        project={project}
      />,
    )

    expect(container.textContent).toBe('')
  })

  it('未分類プロジェクトでは名前変更と削除操作を表示しない', () => {
    render(
      <ProjectManagementModal
        isOpen
        onClose={vi.fn()}
        project={uncategorizedProject}
      />,
    )

    expect(screen.queryByRole('button', { name: '名前を変更' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'プロジェクトを削除' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: '未分類' }).getAttribute('disabled'),
    ).not.toBeNull()
  })

  it('リネーム入力のバリデーションと blur 保存を処理する', async () => {
    const onRenameProject = vi.fn().mockResolvedValue(undefined)

    render(
      <ProjectManagementModal
        isOpen
        onClose={vi.fn()}
        project={project}
        onRenameProject={onRenameProject}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    flushAnimationFrames()

    const initialFocusCalls = vi.mocked(HTMLInputElement.prototype.focus).mock
      .calls.length
    expect(initialFocusCalls).toBeGreaterThan(0)

    expect(HTMLInputElement.prototype.select).toHaveBeenCalledTimes(1)

    const input = screen.getByPlaceholderText('例: ウェブサイトリニューアル')
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByText('プロジェクト名を入力してください')).toBeTruthy()

    fireEvent.blur(input)

    expect(vi.mocked(HTMLInputElement.prototype.focus).mock.calls.length).toBe(
      initialFocusCalls + 1,
    )

    fireEvent.change(input, { target: { value: 'Project Beta' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(onRenameProject).toHaveBeenCalledWith('project-1', 'Project Beta')
    })
    expect(
      screen.getByRole('heading', { name: '「Project Beta」の設定' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '名前を変更' })).toBeTruthy()
  })

  it('Escape でリネームをキャンセルし、未設定ハンドラではエラーを握る', async () => {
    render(
      <ProjectManagementModal isOpen onClose={vi.fn()} project={project} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Project Alpha' }))
    const input = screen.getByPlaceholderText('例: ウェブサイトリニューアル')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Project Alpha' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Project Alpha' }))
    const emptyInput = screen.getByPlaceholderText(
      '例: ウェブサイトリニューアル',
    )
    fireEvent.change(emptyInput, { target: { value: 'Project Alpha' } })
    fireEvent.blur(emptyInput)
    expect(screen.getByRole('button', { name: 'Project Alpha' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    const secondInput = screen.getByPlaceholderText(
      '例: ウェブサイトリニューアル',
    )
    fireEvent.change(secondInput, { target: { value: 'Project Gamma' } })
    fireEvent.keyDown(secondInput, { key: 'Enter' })

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        'プロジェクト名の更新に失敗:',
        expect.any(Error),
      )
    })
  })

  it('削除確認のキャンセルと削除成功を処理する', async () => {
    const onDeleteProject = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(
      <ProjectManagementModal
        isOpen
        onClose={onClose}
        project={project}
        onDeleteProject={onDeleteProject}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトを削除' }))
    expect(
      screen.getByText(
        /このプロジェクトに含まれるすべてのタブとの紐付けも解除されます/,
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByText('削除')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除' }))

    await waitFor(() => {
      expect(onDeleteProject).toHaveBeenCalledWith('project-1')
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('onOpenChange は loading 中や document loading 中は閉じない', async () => {
    let resolveRename: (() => void) | undefined
    const onClose = vi.fn()
    const onRenameProject = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve
        }),
    )

    render(
      <ProjectManagementModal
        isOpen
        onClose={onClose}
        project={project}
        onRenameProject={onRenameProject}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    const input = screen.getByPlaceholderText('例: ウェブサイトリニューアル')
    fireEvent.change(input, { target: { value: 'Project Delta' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(onClose).not.toHaveBeenCalled()

    resolveRename?.()
    await waitFor(() => {
      expect(onRenameProject).toHaveBeenCalledWith('project-1', 'Project Delta')
    })

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    })
    fireEvent.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(onClose).not.toHaveBeenCalled()

    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'complete',
    })
    fireEvent.click(screen.getByRole('button', { name: 'dialog-close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('プロジェクトキーワードを blur で保存する', async () => {
    const onUpdateProjectKeywords = vi.fn().mockResolvedValue(undefined)

    render(
      <ProjectManagementModal
        isOpen
        onClose={vi.fn()}
        project={project}
        onUpdateProjectKeywords={onUpdateProjectKeywords}
      />,
    )

    const titleInput = screen.getByLabelText('タイトルキーワード')
    const urlInput = screen.getByLabelText('URLキーワード')
    const domainInput = screen.getByLabelText('ドメインキーワード')

    fireEvent.change(titleInput, {
      target: { value: 'release' },
    })
    fireEvent.keyDown(titleInput, { key: 'Enter' })
    fireEvent.change(urlInput, {
      target: { value: 'spec' },
    })
    fireEvent.blur(urlInput)
    fireEvent.change(domainInput, {
      target: { value: 'github.com' },
    })
    fireEvent.keyDown(domainInput, { key: 'Enter' })

    const deleteButtons = screen.getAllByRole('button', {
      name: 'キーワードを削除',
    })
    fireEvent.click(deleteButtons[0])

    fireEvent.blur(domainInput)

    await waitFor(() => {
      expect(onUpdateProjectKeywords).toHaveBeenCalledWith('project-1', {
        titleKeywords: ['release'],
        urlKeywords: ['docs', 'spec'],
        domainKeywords: ['example.com', 'github.com'],
      })
    })
  })

  it('各 keyword input の Enter/blur と URL/domain 削除を処理する', async () => {
    const onUpdateProjectKeywords = vi.fn().mockResolvedValue(undefined)
    render(
      <ProjectManagementModal
        isOpen
        onClose={vi.fn()}
        project={project}
        onUpdateProjectKeywords={onUpdateProjectKeywords}
      />,
    )
    const titleInput = screen.getByLabelText('タイトルキーワード')
    const urlInput = screen.getByLabelText('URLキーワード')
    const domainInput = screen.getByLabelText('ドメインキーワード')

    fireEvent.change(titleInput, { target: { value: 'release' } })
    fireEvent.blur(titleInput)
    fireEvent.change(urlInput, { target: { value: 'spec' } })
    fireEvent.keyDown(urlInput, { key: 'Enter' })
    fireEvent.change(domainInput, { target: { value: 'github.com' } })
    fireEvent.blur(domainInput)

    const urlDeleteButton = screen
      .getByText('docs')
      .parentElement?.querySelector('button')
    if (!urlDeleteButton) {
      throw new Error('URL keyword delete button not found')
    }
    fireEvent.click(urlDeleteButton)
    const domainDeleteButton = screen
      .getByText('example.com')
      .parentElement?.querySelector('button')
    if (!domainDeleteButton) {
      throw new Error('domain keyword delete button not found')
    }
    fireEvent.click(domainDeleteButton)

    await waitFor(() => {
      expect(onUpdateProjectKeywords).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ urlKeywords: ['spec'] }),
      )
      expect(onUpdateProjectKeywords).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ domainKeywords: ['github.com'] }),
      )
    })
  })

  it('未分類プロジェクト名の click は rename を開始しない', () => {
    render(
      <ProjectManagementModal
        isOpen
        onClose={vi.fn()}
        project={uncategorizedProject}
      />,
    )

    fireEvent.click(screen.getByText('未分類'))

    expect(screen.queryByRole('textbox', { name: 'プロジェクト名' })).toBeNull()
  })

  it('削除ハンドラ未設定でも例外で落とさない', async () => {
    render(
      <ProjectManagementModal isOpen onClose={vi.fn()} project={project} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除' }))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        'プロジェクトの削除に失敗しました:',
        expect.any(Error),
      )
    })
  })

  it('処理中は onBlur と削除ボタンを再実行しない', async () => {
    let resolveRename: (() => void) | undefined
    let resolveDelete: (() => void) | undefined
    const onRenameProject = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve
        }),
    )
    const onDeleteProject = vi.fn(
      async () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve
        }),
    )

    const { rerender } = render(
      <ProjectManagementModal
        isOpen
        onClose={vi.fn()}
        project={project}
        onRenameProject={onRenameProject}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    const renameInput = screen.getByPlaceholderText(
      '例: ウェブサイトリニューアル',
    )
    fireEvent.change(renameInput, { target: { value: 'Project Busy' } })
    fireEvent.keyDown(renameInput, { key: 'Enter' })
    fireEvent.blur(renameInput)

    expect(onRenameProject).toHaveBeenCalledTimes(1)

    resolveRename?.()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Project Busy' })).toBeTruthy()
    })

    rerender(
      <ProjectManagementModal
        isOpen
        onClose={vi.fn()}
        project={project}
        onDeleteProject={onDeleteProject}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(onDeleteProject).toHaveBeenCalledTimes(1)

    resolveDelete?.()
  })
})
