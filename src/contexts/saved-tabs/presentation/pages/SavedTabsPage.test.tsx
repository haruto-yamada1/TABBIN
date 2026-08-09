// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsCustomProjectDto as createCurrentCustomProject,
  createSavedTabsTabGroupDto as createCurrentTabGroup,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import {
  toSavedTabsCustomProjectViewModel,
  toSavedTabsTabGroupViewModel,
} from '@/contexts/saved-tabs/presentation/mappers/SavedTabsCompatibilityViewModelMapper'

const layoutPropsSpy = vi.hoisted(() => vi.fn())

vi.mock(
  '@/contexts/saved-tabs/presentation/components/SavedTabsPresentationLayout',
  () => ({
    SavedTabsPresentationLayout: (props: {
      initialViewMode: string
      controller: { viewModel: { hasContent: boolean } }
      onViewModeNavigate?: (mode: 'custom' | 'domain') => void
    }) => {
      layoutPropsSpy(props)
      return (
        <div
          data-testid='saved-tabs-page-layout'
          data-has-content={props.controller.viewModel.hasContent}
          data-mode={props.initialViewMode}
        />
      )
    },
  }),
)

import { SavedTabsPage } from './SavedTabsPage'

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  cleanup()
  layoutPropsSpy.mockClear()
})

const currentGroup = createCurrentTabGroup({
  domain: 'example.com',
  id: 'group-1',
  memberships: ['url-1'].map((urlId) => ({ urlId })),
})
const group = toSavedTabsTabGroupViewModel(currentGroup)
const currentProject = createCurrentCustomProject({
  id: 'project-1',
  name: 'Reading',
})
const project = toSavedTabsCustomProjectViewModel(currentProject)

const createBoundary = () => {
  const deps = createSavedTabsPresentationPortsStub()
  const getSavedTabs = vi.fn(async () => [currentGroup])
  const getCustomProjects = vi.fn(async () => [currentProject])
  const useCases = createSavedTabsUseCasesStub({
    getCustomProjects,
    getSavedTabs,
  })
  return { deps, getCustomProjects, getSavedTabs, useCases }
}

describe('SavedTabsPage', () => {
  it('初期 application DTO を controller と layout へ渡す', () => {
    const { deps, useCases } = createBoundary()
    render(
      <SavedTabsPage
        deps={deps}
        initialCustomProjects={[project]}
        initialTabGroups={[group]}
        search='?mode=custom'
        useCases={useCases}
      />,
    )
    const layout = screen.getByTestId('saved-tabs-page-layout')
    expect(layout.dataset.hasContent).toBe('true')
    expect(layout.dataset.mode).toBe('custom')
  })

  it('初期データが無ければ application query で refresh する', async () => {
    const { deps, getCustomProjects, getSavedTabs, useCases } = createBoundary()
    render(<SavedTabsPage deps={deps} useCases={useCases} />)
    await waitFor(() => {
      expect(getSavedTabs).toHaveBeenCalledOnce()
      expect(getCustomProjects).toHaveBeenCalledOnce()
      expect(
        screen.getByTestId('saved-tabs-page-layout').dataset.hasContent,
      ).toBe('true')
    })
  })

  it('initialViewMode と navigation callback を layout へ伝える', () => {
    const { deps, useCases } = createBoundary()
    const onViewModeNavigate = vi.fn()
    render(
      <SavedTabsPage
        deps={deps}
        initialViewMode='domain'
        onViewModeNavigate={onViewModeNavigate}
        useCases={useCases}
      />,
    )
    const latestProps = layoutPropsSpy.mock.calls.at(-1)?.[0]
    expect(latestProps.initialViewMode).toBe('domain')
    expect(latestProps.onViewModeNavigate).toBe(onViewModeNavigate)
  })
})
