import { describe, expect, it, vi } from 'vitest'

import {
  createSavedTabsPresentationPortsStub,
  createSavedTabsUseCasesStub,
} from './SavedTabsPresentationStubs'

describe('createSavedTabsUseCasesStub', () => {
  it('override を返し、未指定 use-case は fail-fast する', async () => {
    const getSavedTabs = vi.fn(async () => [])
    const useCases = createSavedTabsUseCasesStub({ getSavedTabs })

    await expect(useCases.getSavedTabs()).resolves.toEqual([])
    expect(() => {
      void useCases.getCustomProjects()
    }).toThrow('SavedTabsUseCases.getCustomProjects is not stubbed')
  })
})

describe('createSavedTabsPresentationPortsStub', () => {
  it('default port 群は安全な no-op と最小結果を返す', async () => {
    const ports = createSavedTabsPresentationPortsStub()

    await expect(
      ports.browserTabPort.open({ url: 'https://example.com' }),
    ).resolves.toEqual({ url: 'https://example.com' })
    await expect(
      ports.categoryAssignmentPort.saveParentCategories([]),
    ).resolves.toBeUndefined()
    await expect(
      ports.categoryAssignmentPort.saveTabGroups([]),
    ).resolves.toBeUndefined()
    await expect(
      ports.messagingPort.send({
        action: 'urlDragStarted',
        groupId: 'group-1',
        url: 'https://example.com',
      }),
    ).resolves.toBeUndefined()
    await expect(
      ports.migrationPort.migrateParentCategoriesToDomainNames(),
    ).resolves.toBeUndefined()
    await expect(
      ports.migrationPort.migrateToUrlsStorage(),
    ).resolves.toBeUndefined()
    expect(ports.storageChangePort.subscribe(() => undefined)()).toBeUndefined()
  })

  it('指定した port override をそのまま返す', () => {
    const storageChangePort = { subscribe: vi.fn(() => vi.fn()) }
    const ports = createSavedTabsPresentationPortsStub({ storageChangePort })

    expect(ports.storageChangePort).toBe(storageChangePort)
  })
})
