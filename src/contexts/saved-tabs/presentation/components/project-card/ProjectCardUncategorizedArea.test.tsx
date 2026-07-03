// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
// eslint-disable-next-line eslint/no-unused-vars
import { dirname, resolve } from 'node:path'
// eslint-disable-next-line eslint/no-unused-vars
import { fileURLToPath } from 'node:url'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

const projectCardI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

const { useProjectCardMock } = vi.hoisted(() => ({
  useProjectCardMock: vi.fn(),
}))

vi.mock('./ProjectCardContext', () => ({
  useProjectCard: useProjectCardMock,
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: projectCardI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(projectCardI18nState.language)
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

vi.mock('@/contexts/saved-tabs/presentation/components/ProjectUrlItem', () => ({
  ProjectUrlItem: ({ item }: { item: { title: string } }) => (
    <li>{item.title}</li>
  ),
}))

import { ProjectCardUncategorizedArea } from './ProjectCardUncategorizedArea'

interface TestProjectUrl {
  readonly title: string
  readonly url: string
}

interface TestProjectCardContextValue {
  readonly handlers: {
    readonly handleDeleteUrl: ReturnType<typeof vi.fn>
    readonly handleOpenUrl: ReturnType<typeof vi.fn>
    readonly handleSetUrlCategory: ReturnType<typeof vi.fn>
  }
  readonly hookState: {
    readonly urls: {
      readonly projectUrls: readonly TestProjectUrl[]
      readonly uncategorizedUrls: readonly TestProjectUrl[]
    }
  }
  readonly isUncategorizedOver: boolean
  readonly project: {
    readonly categories: readonly string[]
    readonly id: string
  }
  readonly setUncategorizedDropRef: ReturnType<typeof vi.fn>
  readonly settings: {
    readonly confirmDeleteEach: boolean
  }
}

interface TestProjectCardContextOverrides {
  readonly handlers?: Partial<TestProjectCardContextValue['handlers']>
  readonly hookState?: {
    readonly urls?: Partial<TestProjectCardContextValue['hookState']['urls']>
  }
  readonly isUncategorizedOver?: boolean
  readonly project?: Partial<TestProjectCardContextValue['project']>
  readonly setUncategorizedDropRef?: TestProjectCardContextValue['setUncategorizedDropRef']
  readonly settings?: Partial<TestProjectCardContextValue['settings']>
}

const createContextValue = (
  overrides: TestProjectCardContextOverrides = {},
): TestProjectCardContextValue => ({
  hookState: {
    urls: {
      projectUrls: [{ url: 'https://example.com', title: 'Example Tab' }],
      uncategorizedUrls: [{ url: 'https://example.com', title: 'Example Tab' }],
      ...overrides.hookState?.urls,
    },
  },
  project: {
    id: 'project-1',
    categories: ['Work'],
    ...overrides.project,
  },
  settings: {
    confirmDeleteEach: false,
    ...overrides.settings,
  },
  isUncategorizedOver: overrides.isUncategorizedOver ?? false,
  setUncategorizedDropRef: overrides.setUncategorizedDropRef ?? vi.fn(),
  handlers: {
    handleOpenUrl: vi.fn(),
    handleDeleteUrl: vi.fn(),
    handleSetUrlCategory: vi.fn(),
    ...overrides.handlers,
  },
})

describe('ProjectCardUncategorizedArea', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    projectCardI18nState.language = 'ja'
  })

  it('shared ui button を使い、生の button 要素を残さない', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, './ProjectCardUncategorizedArea.tsx'),
      'utf8',
    )

    expect(source).toContain("from '@/components/ui/button'")
    expect(source).not.toContain('<button')
  })

  it('renders English uncategorized area copy when the display language is en', () => {
    projectCardI18nState.language = 'en'
    useProjectCardMock.mockReturnValue(createContextValue())

    render(<ProjectCardUncategorizedArea />)

    expect(screen.getByLabelText('Uncategorized tabs area')).toBeTruthy()
    expect(screen.getByText('Uncategorized tabs')).toBeTruthy()
  })

  it('カテゴリがない場合は未分類見出しを省略して URL 一覧だけ表示する', () => {
    useProjectCardMock.mockReturnValue(
      createContextValue({
        project: {
          id: 'project-1',
          categories: [],
        },
      }),
    )

    render(<ProjectCardUncategorizedArea />)

    expect(screen.getByText('Example Tab')).toBeTruthy()
    expect(screen.queryByText('未分類のタブ')).toBeNull()
  })

  it('空の未分類エリアで選択中 URL が projectUrls にあれば未分類へ戻す', async () => {
    const user = userEvent.setup()
    const handleSetUrlCategory = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'https://example.com',
    } as Selection)
    useProjectCardMock.mockReturnValue(
      createContextValue({
        hookState: {
          urls: {
            projectUrls: [{ url: 'https://example.com', title: 'Example Tab' }],
            uncategorizedUrls: [],
          },
        },
        handlers: {
          handleSetUrlCategory,
        },
      }),
    )

    render(<ProjectCardUncategorizedArea />)
    await user.click(
      screen.getByRole('button', {
        name: 'タブをここにドロップして未分類に移動',
      }),
    )

    expect(handleSetUrlCategory).toHaveBeenCalledWith(
      'project-1',
      'https://example.com',
      undefined,
    )
  })

  it('空の未分類エリアで選択中 URL が projectUrls にない場合は no-op', async () => {
    const user = userEvent.setup()
    const handleSetUrlCategory = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'https://other.example.com',
    } as Selection)
    useProjectCardMock.mockReturnValue(
      createContextValue({
        hookState: {
          urls: {
            projectUrls: [{ url: 'https://example.com', title: 'Example Tab' }],
            uncategorizedUrls: [],
          },
        },
        handlers: {
          handleSetUrlCategory,
        },
        isUncategorizedOver: true,
      }),
    )

    render(<ProjectCardUncategorizedArea />)
    await user.click(
      screen.getByRole('button', {
        name: 'タブをここにドロップして未分類に移動',
      }),
    )

    expect(handleSetUrlCategory).not.toHaveBeenCalled()
  })

  it('projectUrls が空なら未分類エリアを表示しない', () => {
    useProjectCardMock.mockReturnValue(
      createContextValue({
        hookState: {
          urls: {
            projectUrls: [],
            uncategorizedUrls: [],
          },
        },
      }),
    )

    const { container } = render(<ProjectCardUncategorizedArea />)

    expect(container).toBeEmptyDOMElement()
  })
})
