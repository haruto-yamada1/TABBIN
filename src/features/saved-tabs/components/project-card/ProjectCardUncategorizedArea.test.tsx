// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
// eslint-disable-next-line eslint/no-unused-vars
import { dirname, resolve } from 'node:path'
// eslint-disable-next-line eslint/no-unused-vars
import { fileURLToPath } from 'node:url'

import { cleanup, render, screen } from '@testing-library/react'
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

vi.mock('@/features/saved-tabs/components/ProjectUrlItem', () => ({
  ProjectUrlItem: ({ item }: { item: { title: string } }) => (
    <li>{item.title}</li>
  ),
}))

import { ProjectCardUncategorizedArea } from './ProjectCardUncategorizedArea'

const createContextValue = () => ({
  hookState: {
    urls: {
      projectUrls: [{ url: 'https://example.com', title: 'Example Tab' }],
      uncategorizedUrls: [{ url: 'https://example.com', title: 'Example Tab' }],
    },
  },
  project: {
    id: 'project-1',
    categories: ['Work'],
  },
  settings: {
    confirmDeleteEach: false,
  },
  isUncategorizedOver: false,
  setUncategorizedDropRef: vi.fn(),
  handlers: {
    handleOpenUrl: vi.fn(),
    handleDeleteUrl: vi.fn(),
    handleSetUrlCategory: vi.fn(),
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
})
