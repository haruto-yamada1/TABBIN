// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import type { CustomProject, TabGroup, ViewMode } from '@/types/storage'

const headerI18nState = vi.hoisted(() => ({
  language: 'ja' as 'en' | 'ja',
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/features/i18n/context/I18nProvider', async () => {
  const { getMessages } = await vi.importActual<
    // eslint-disable-next-line typescript/consistent-type-imports
    typeof import('@/features/i18n/messages')
  >('@/features/i18n/messages')

  return {
    useI18n: () => ({
      language: headerI18nState.language,
      t: (key: string, fallback?: string, values?: Record<string, string>) => {
        const messages = getMessages(headerI18nState.language)
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

vi.mock('./CategoryModal', () => ({
  CategoryModal: () => <div>CategoryModal</div>,
}))

vi.mock('./ViewModeToggle', () => ({
  ViewModeToggle: () => <button type='button'>ViewModeToggle</button>,
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
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
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

import { Header } from './Header'

const createProps = (
  overrides: Partial<React.ComponentProps<typeof Header>> = {},
) => ({
  tabGroups: [
    {
      id: 'group-1',
      domain: 'example.com',
    },
  ] as TabGroup[],
  currentMode: 'domain' as ViewMode,
  onModeChange: vi.fn(),
  searchQuery: '',
  onSearchChange: vi.fn(),
  customProjects: [] as CustomProject[],
  onCreateProject: vi.fn(),
  getSavedTabsPageDataQuery: vi.fn(async () => ({
    tabGroups: [],
    parentCategories: [],
    userSettings: {} as UserSettingsDto,
  })),
  ...overrides,
})

describe('Header additional', () => {
  beforeEach(() => {
    headerI18nState.language = 'ja'
    const chromeGlobal = globalThis as unknown as { chrome: typeof chrome }
    chromeGlobal.chrome = {
      runtime: {
        getURL: vi.fn((path: string) => path),
      },
    } as unknown as typeof chrome
    vi.spyOn(window, 'open').mockImplementation(vi.fn() as never)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('urls と urlIds が無いグループでも tabCount を 0 のまま表示する', () => {
    render(<Header {...createProps()} />)

    expect(screen.getByText('タブ:0')).toBeTruthy()
    expect(screen.getByText('ドメイン:1')).toBeTruthy()
  })
})
