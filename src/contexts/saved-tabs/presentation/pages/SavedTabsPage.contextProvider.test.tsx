// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StorageChangePort } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from '@/contexts/saved-tabs/application/testing/SavedTabsPresentationStubs'
import type * as SavedTabsUseCasesContextModule from '@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext'

const probeState = vi.hoisted(() => ({
  capturedPort: null as StorageChangePort | null,
}))

vi.mock(
  '@/contexts/saved-tabs/presentation/components/SavedTabsPresentationLayout',
  async () => {
    const { useSavedTabsUseCases } = await vi.importActual<
      typeof SavedTabsUseCasesContextModule
    >('@/contexts/saved-tabs/presentation/controllers/SavedTabsUseCasesContext')
    return {
      SavedTabsPresentationLayout: () => {
        const context = useSavedTabsUseCases()
        probeState.capturedPort = context?.deps.storageChangePort ?? null
        return (
          <div
            data-testid='context-probe'
            data-has-context={Boolean(context)}
          />
        )
      },
    }
  },
)

import { SavedTabsPage } from './SavedTabsPage'

describe('SavedTabsPage provider', () => {
  afterEach(() => {
    cleanup()
    probeState.capturedPort = null
  })

  it('presentation ports と use-cases を context へ配布する', () => {
    const storageChangePort: StorageChangePort = {
      subscribe: vi.fn(() => () => {}),
    }
    const deps = createSavedTabsPresentationPortsStub({ storageChangePort })
    const useCases = createSavedTabsUseCasesStub({
      getCustomProjects: vi.fn(async () => []),
      getSavedTabs: vi.fn(async () => []),
    })
    render(<SavedTabsPage deps={deps} useCases={useCases} />)
    expect(screen.getByTestId('context-probe').dataset.hasContext).toBe('true')
    expect(probeState.capturedPort).toBe(storageChangePort)
  })
})
