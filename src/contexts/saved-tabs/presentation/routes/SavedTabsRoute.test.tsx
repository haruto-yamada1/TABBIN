// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'

import type { SavedTabsDepsFactory } from './SavedTabsRoute'

const pagePropsSpy = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/saved-tabs/presentation/pages/SavedTabsPage', () => ({
  SavedTabsPage: (props: Record<string, unknown>) => {
    pagePropsSpy(props)
    return <div data-testid='saved-tabs-page' />
  },
}))

import { SavedTabsRoute } from './SavedTabsRoute'

const createDeps = vi.fn((_: Parameters<SavedTabsDepsFactory>[0]) => ({
  deps: createSavedTabsPresentationPortsStub(),
  useCases: createSavedTabsUseCasesStub(),
}))

describe('SavedTabsRoute', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('composition factory の結果を page へ渡す', () => {
    render(<SavedTabsRoute createDeps={createDeps} search='?mode=domain' />)
    expect(screen.getByTestId('saved-tabs-page')).toBeTruthy()
    expect(createDeps).toHaveBeenCalledOnce()
    const factoryOptions = createDeps.mock.calls.at(-1)?.[0]
    expect(factoryOptions?.resolveActive()).toBe(true)
    const props = pagePropsSpy.mock.calls.at(-1)?.[0]
    expect(props.deps).toBeDefined()
    expect(props.useCases).toBeDefined()
    expect(props.initialViewMode).toBe('domain')
  })

  it('search と navigation callback を page へ渡す', () => {
    const onViewModeNavigate = vi.fn()
    render(
      <SavedTabsRoute
        createDeps={createDeps}
        onViewModeNavigate={onViewModeNavigate}
        search='?mode=custom'
      />,
    )
    const props = pagePropsSpy.mock.calls.at(-1)?.[0]
    expect(props.search).toBe('?mode=custom')
    expect(props.initialViewMode).toBe('custom')
    expect(props.onViewModeNavigate).toBe(onViewModeNavigate)
  })

  it('search 未指定なら window.location.search から initialViewMode を解決する', () => {
    window.history.pushState(null, '', '/saved-tabs?mode=custom')

    render(<SavedTabsRoute createDeps={createDeps} />)

    const props = pagePropsSpy.mock.calls.at(-1)?.[0]
    expect(props.search).toBeUndefined()
    expect(props.initialViewMode).toBe('custom')
  })
})
