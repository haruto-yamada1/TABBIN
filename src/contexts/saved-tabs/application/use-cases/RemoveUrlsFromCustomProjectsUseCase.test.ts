import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { TabGroup } from '@/types/storage'

import type { CustomProjectsCommandService } from '../ports/CustomProjectsCommandService'
import type { LoadTabGroupUrlsUseCase } from './LoadTabGroupUrlsUseCase'
import { createRemoveUrlsFromCustomProjectsUseCase } from './RemoveUrlsFromCustomProjectsUseCase'
import type { RemoveUrlsFromCustomProjectsUseCaseDeps } from './RemoveUrlsFromCustomProjectsUseCase'

const createCommandServiceMock = (): {
  commandService: CustomProjectsCommandService
  removeUrlIdsFromAllCustomProjects: ReturnType<typeof vi.fn>
  removeUrlsFromAllCustomProjects: ReturnType<typeof vi.fn>
} => {
  const removeUrlIdsFromAllCustomProjects = vi.fn(
    // eslint-disable-next-line typescript/require-await
    async () => undefined,
  )
  const removeUrlsFromAllCustomProjects = vi.fn(
    // eslint-disable-next-line typescript/require-await
    async () => undefined,
  )
  const commandService = {
    addCategoryToProject: vi.fn(),
    addUrlToCustomProject: vi.fn(),
    moveUrlBetweenCustomProjects: vi.fn(),
    removeCategoryFromProject: vi.fn(),
    removeUrlFromCustomProject: vi.fn(),
    removeUrlIdsFromAllCustomProjects,
    removeUrlsFromAllCustomProjects,
    removeUrlsFromCustomProject: vi.fn(),
    renameCategoryInProject: vi.fn(),
    reorderProjectUrls: vi.fn(),
    setUrlCategory: vi.fn(),
    updateCategoryKeywords: vi.fn(),
    updateCategoryOrder: vi.fn(),
    updateProjectKeywords: vi.fn(),
  }
  return {
    commandService: commandService as unknown as CustomProjectsCommandService,
    removeUrlIdsFromAllCustomProjects,
    removeUrlsFromAllCustomProjects,
  }
}

const createLoadTabGroupUrlsMock = (
  // eslint-disable-next-line typescript/consistent-type-imports
  resolveUrls: (group: TabGroup) => Promise<{ url: string }[] | undefined>,
): LoadTabGroupUrlsUseCase => {
  // eslint-disable-next-line typescript/require-await
  return (async (command: { tabGroup: TabGroup }) => {
    return { urls: (await resolveUrls(command.tabGroup)) ?? [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
}

const buildDeps = (options: {
  resolveUrls?: (group: TabGroup) => Promise<{ url: string }[] | undefined>
}): RemoveUrlsFromCustomProjectsUseCaseDeps & {
  commandServiceMock: ReturnType<typeof createCommandServiceMock>
} => {
  const commandServiceMock = createCommandServiceMock()
  return {
    commandServiceMock,
    customProjectsCommandService: commandServiceMock.commandService,
    loadTabGroupUrls: createLoadTabGroupUrlsMock(
      options.resolveUrls ??
        // eslint-disable-next-line typescript/require-await
        (async () => undefined),
    ),
  }
}

const buildTabGroup = (overrides: Partial<TabGroup>): TabGroup => ({
  domain: 'example.com',
  id: 'group-1',
  urlIds: [],
  ...overrides,
})

describe('RemoveUrlsFromCustomProjectsUseCase', () => {
  it('modern 形式グループ (urlIds) だけを含む場合、URL ID ベースで同期削除する', async () => {
    const deps = buildDeps({})
    const useCase = createRemoveUrlsFromCustomProjectsUseCase(deps)

    const result = await useCase({
      tabGroups: [
        buildTabGroup({
          domain: 'ids.example.com',
          id: 'group-a',
          urlIds: ['url-1'],
        }),
        buildTabGroup({
          domain: 'ids2.example.com',
          id: 'group-b',
          urlIds: ['url-2', 'url-3'],
        }),
      ],
    })

    expect(
      deps.commandServiceMock.removeUrlIdsFromAllCustomProjects,
    ).toHaveBeenCalledWith(['url-1', 'url-2', 'url-3'], { throwOnError: true })
    expect(
      deps.commandServiceMock.removeUrlsFromAllCustomProjects,
    ).not.toHaveBeenCalled()
    expect(result).toStrictEqual({ removedUrlCount: 0, removedUrlIdCount: 3 })
  })

  it('legacy 形式グループ (urlIds 無し) だけを含む場合、URL 文字列で同期削除する', async () => {
    const deps = buildDeps({
      // eslint-disable-next-line typescript/require-await
      resolveUrls: async (group) => {
        if (group.id === 'group-a') {
          return [{ url: 'https://legacy.example.com/a' }]
        }
        if (group.id === 'group-b') {
          return [
            { url: 'https://legacy.example.com/b1' },
            { url: 'https://legacy.example.com/b2' },
          ]
        }
        return undefined
      },
    })
    const useCase = createRemoveUrlsFromCustomProjectsUseCase(deps)

    const result = await useCase({
      tabGroups: [
        buildTabGroup({
          domain: 'legacy.example.com',
          id: 'group-a',
          urlIds: [],
        }),
        buildTabGroup({
          domain: 'legacy2.example.com',
          id: 'group-b',
          urlIds: [],
        }),
      ],
    })

    expect(
      deps.commandServiceMock.removeUrlIdsFromAllCustomProjects,
    ).not.toHaveBeenCalled()
    expect(
      deps.commandServiceMock.removeUrlsFromAllCustomProjects,
    ).toHaveBeenCalledWith(
      [
        'https://legacy.example.com/a',
        'https://legacy.example.com/b1',
        'https://legacy.example.com/b2',
      ],
      { throwOnError: true },
    )
    expect(result).toStrictEqual({ removedUrlCount: 3, removedUrlIdCount: 0 })
  })

  it('modern / legacy 混在でも両方とも同期削除する', async () => {
    const deps = buildDeps({
      // eslint-disable-next-line typescript/require-await
      resolveUrls: async (group) => {
        if (group.id === 'group-legacy') {
          return [{ url: 'https://legacy.example.com/a' }]
        }
        return undefined
      },
    })
    const useCase = createRemoveUrlsFromCustomProjectsUseCase(deps)

    const result = await useCase({
      tabGroups: [
        buildTabGroup({
          domain: 'ids.example.com',
          id: 'group-ids',
          urlIds: ['url-1'],
        }),
        buildTabGroup({
          domain: 'legacy.example.com',
          id: 'group-legacy',
          urlIds: [],
        }),
      ],
    })

    expect(
      deps.commandServiceMock.removeUrlIdsFromAllCustomProjects,
    ).toHaveBeenCalledWith(['url-1'], { throwOnError: true })
    expect(
      deps.commandServiceMock.removeUrlsFromAllCustomProjects,
    ).toHaveBeenCalledWith(['https://legacy.example.com/a'], {
      throwOnError: true,
    })
    expect(result).toStrictEqual({ removedUrlCount: 1, removedUrlIdCount: 1 })
  })

  it('legacy グループの URL 取得が失敗した場合、エラーログを残し他グループの削除は継続する', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = buildDeps({
      // eslint-disable-next-line typescript/require-await
      resolveUrls: async () => {
        throw new Error('load failed')
      },
    })
    const useCase = createRemoveUrlsFromCustomProjectsUseCase(deps)

    const result = await useCase({
      tabGroups: [
        buildTabGroup({
          domain: 'ids.example.com',
          id: 'group-ids',
          urlIds: ['url-1'],
        }),
        buildTabGroup({
          domain: 'legacy.example.com',
          id: 'group-legacy',
          urlIds: [],
        }),
      ],
    })

    expect(consoleError).toHaveBeenCalledWith(
      '複数グループのURL取得エラー:',
      expect.any(Error),
    )
    expect(
      deps.commandServiceMock.removeUrlIdsFromAllCustomProjects,
    ).toHaveBeenCalledWith(['url-1'], { throwOnError: true })
    expect(
      deps.commandServiceMock.removeUrlsFromAllCustomProjects,
    ).not.toHaveBeenCalled()
    expect(result).toStrictEqual({ removedUrlCount: 0, removedUrlIdCount: 1 })

    consoleError.mockRestore()
  })

  it('legacy グループが空配列を返した場合、URL 同期削除をスキップする', async () => {
    const deps = buildDeps({
      // eslint-disable-next-line typescript/require-await
      resolveUrls: async () => [],
    })
    const useCase = createRemoveUrlsFromCustomProjectsUseCase(deps)

    const result = await useCase({
      tabGroups: [
        buildTabGroup({
          domain: 'legacy.example.com',
          id: 'group-legacy',
          urlIds: [],
        }),
      ],
    })

    expect(
      deps.commandServiceMock.removeUrlsFromAllCustomProjects,
    ).not.toHaveBeenCalled()
    expect(result).toStrictEqual({ removedUrlCount: 0, removedUrlIdCount: 0 })
  })
})
