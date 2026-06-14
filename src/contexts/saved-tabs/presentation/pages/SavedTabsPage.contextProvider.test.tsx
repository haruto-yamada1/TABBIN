// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BrowserTabPort } from '../../application/ports/BrowserTabPort'
import type { BrowserWindowPort } from '../../application/ports/BrowserWindowPort'
import type { NotificationPort } from '../../application/ports/NotificationPort'
import type { SetCategoryKeywordsPort } from '../../application/ports/SetCategoryKeywordsPort'
import type { StorageChangePort } from '../../application/ports/StorageChangePort'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import type { SavedTabsUseCasesDeps } from '../../infrastructure/composition/createSavedTabsUseCasesDeps'
import { useSavedTabsUseCases } from '../controllers/SavedTabsUseCasesContext'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>{children}</>
  ),
  useI18n: () => ({
    language: 'ja',
    t: (key: string) => key,
  }),
  useI18nText: () => (key: string) => key,
}))

const createInMemoryDeps = (): SavedTabsUseCasesDeps => {
  const tabGroupRepository: TabGroupRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [],
    // eslint-disable-next-line typescript/require-await
    findById: async () => null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
  }
  const customProjectRepository: CustomProjectRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [],
    // eslint-disable-next-line typescript/require-await
    findById: async () => null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    findOrder: async () => [],
    // eslint-disable-next-line typescript/require-await
    saveOrder: async () => undefined,
  }
  const urlRecordRepository: UrlRecordRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [],
    // eslint-disable-next-line typescript/require-await
    findById: async () => null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
  }
  const parentCategoryRepository: ParentCategoryRepository = {
    // eslint-disable-next-line typescript/require-await
    findAll: async () => [],
    // eslint-disable-next-line typescript/require-await
    findById: async () => null,
    // eslint-disable-next-line typescript/require-await
    removeByIds: async () => undefined,
    // eslint-disable-next-line typescript/require-await
    saveAll: async () => undefined,
  }
  const browserTabPort: BrowserTabPort = {
    // eslint-disable-next-line typescript/require-await
    open: async (input: { url: string }) => ({ url: input.url }),
  }
  const browserWindowPort: BrowserWindowPort = {
    // eslint-disable-next-line typescript/require-await
    openWithUrls: async (input: { urls: readonly string[] }) => ({
      urls: [...input.urls],
    }),
  }
  const notificationPort: NotificationPort = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
  const setCategoryKeywordsPort: SetCategoryKeywordsPort = {
    setCategoryKeywords: vi.fn().mockResolvedValue(undefined),
  }
  return {
    browserTabPort,
    browserWindowPort,
    customProjectRepository,
    notificationPort,
    parentCategoryRepository,
    setCategoryKeywordsPort,
    storageChangePort: {
      subscribe: () => () => {},
    },
    tabGroupRepository,
    urlRecordRepository,
  }
}

const probeState = vi.hoisted(() => ({
  // probe が観測した context の storageChangePort 参照を保持し、
  // テスト本体から参照同一性で検証する。
  capturedPort: null as StorageChangePort | null,
}))

const ContextProbe = ({ testId }: { testId: string }) => {
  const context = useSavedTabsUseCases()
  probeState.capturedPort = context?.deps.storageChangePort ?? null
  const hasContext = context ? 'true' : 'false'
  const hasPort = context?.deps.storageChangePort ? 'true' : 'false'
  return (
    <div
      data-testid={testId}
      data-has-context={hasContext}
      data-has-port={hasPort}
    />
  )
}

vi.mock(
  '@/contexts/saved-tabs/presentation/components/SavedTabsPresentationLayout',
  () => ({
    SavedTabsPresentationLayout: () => <ContextProbe testId='context-probe' />,
  }),
)

import { SavedTabsPage } from './SavedTabsPage'

describe('SavedTabsPage / issue #495 review P2', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    probeState.capturedPort = null
  })

  it('SavedTabsUseCasesProvider を mount し storageChangePort を配布する', () => {
    // Codex review P2 指摘: SavedTabsPage が provider を介さずに
    // SavedTabsPresentationLayout を直接レンダリングしていたため、
    // 子コンポーネント (例: DomainCardActions) から
    // `useSavedTabsUseCases()` を呼ぶと `null` が返り、
    // `storageChangePort` が undefined になっていた。
    // provider を page 配下に置くことで、deps.storageChangePort が
    // 子コンポーネントへ確実に届くことを検証する。
    const subscribeSpy = vi.fn(() => () => {})
    const storageChangePort: StorageChangePort = {
      subscribe: subscribeSpy,
    }
    const deps: SavedTabsUseCasesDeps = {
      ...createInMemoryDeps(),
      storageChangePort,
    }
    render(<SavedTabsPage deps={deps} />)
    const probe = screen.getByTestId('context-probe')
    expect(probe.getAttribute('data-has-context')).toBe('true')
    // deps で渡した storageChangePort が context 経由で取得できる
    // ことを verify する。provider が null だと
    // `useSavedTabsUseCases()` が undefined を返し、
    // 配下の KeywordModal が subscribe できない (Codex 指摘)
    expect(probe.getAttribute('data-has-port')).toBe('true')
    expect(probeState.capturedPort).toBe(storageChangePort)
  })
})
