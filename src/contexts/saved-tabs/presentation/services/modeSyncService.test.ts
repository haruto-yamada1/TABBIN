import type { RefObject, SetStateAction } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { TypedSavedTabsStorageChange } from '@/contexts/saved-tabs/application/ports/StorageChangePort'
import type { ViewMode } from '@/contexts/saved-tabs/presentation/types/mode'

import { syncStorageChanges } from './modeSyncService'

const createProject = (overrides: Partial<CustomProject>): CustomProject => ({
  id: 'project-1',
  name: 'Project 1',
  categories: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

// テストヘルパー: port DTO を直接組み立てるための薄いラッパー。
// ポート仕様 (`TypedSavedTabsStorageChange`) を満たす値だけを渡し、
// service 側ロジックのシナリオ検証に集中する。
// 各テストで `TypedSavedTabsStorageChange` 型の `change` 変数を直接
// 組み立てて `changes: [change]` の形で渡す。

const createUrlsChange = (
  newValue: unknown,
  oldValue?: unknown,
): TypedSavedTabsStorageChange => ({
  key: 'urls',
  kind: 'noPayload',
  newValue,
  oldValue,
})

const createSyncContext = (params?: {
  mode?: ViewMode
  projects?: CustomProject[]
  settings?: UserSettingsDto
  categories?: ParentCategory[]
}) => {
  let projects = params?.projects ?? []
  let settings = params?.settings ?? ({} as UserSettingsDto)
  let categories = params?.categories ?? []
  const mode = params?.mode ?? 'custom'

  const refreshTabGroupsWithUrls = vi.fn(
    async (_nextGroups?: TabGroup[]) => [] as TabGroup[],
  )
  const syncDomainDataToCustomProjects = vi.fn(
    async () => [] as CustomProject[],
  )
  const setSettings = vi.fn((updater: SetStateAction<UserSettingsDto>) => {
    settings = typeof updater === 'function' ? updater(settings) : updater
    return settings
  })
  const setCategories = vi.fn((updater: SetStateAction<ParentCategory[]>) => {
    categories = typeof updater === 'function' ? updater(categories) : updater
    return categories
  })
  const setCustomProjects = vi.fn(
    (updater: SetStateAction<CustomProject[]>) => {
      projects = typeof updater === 'function' ? updater(projects) : updater
      return projects
    },
  )

  return {
    args: {
      viewModeRef: {
        current: mode,
      } as RefObject<ViewMode>,
      refreshTabGroupsWithUrls,
      syncDomainDataToCustomProjects,
      setSettings,
      setCategories,
      setCustomProjects,
    },
    state: {
      getProjects: () => projects,
      getSettings: () => settings,
      getCategories: () => categories,
    },
    spies: {
      refreshTabGroupsWithUrls,
      syncDomainDataToCustomProjects,
      setSettings,
      setCategories,
      setCustomProjects,
    },
  }
}

describe('syncStorageChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('customProjectOrder 変更時にカスタムモードの表示順を更新する', async () => {
    const prevProjects = [
      createProject({ id: 'project-1', name: 'P1' }),
      createProject({ id: 'project-2', name: 'P2' }),
      createProject({ id: 'project-3', name: 'P3' }),
    ]
    const ctx = createSyncContext({
      projects: prevProjects,
    })
    const orderChange: TypedSavedTabsStorageChange = {
      key: 'customProjectOrder',
      kind: 'parsed',
      oldValue: ['project-1', 'project-2', 'project-3'],
      payload: ['project-3', 'project-1'],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [orderChange],
    })

    expect(ctx.state.getProjects().map((project) => project.id)).toStrictEqual([
      'project-3',
      'project-1',
      'project-2',
    ])
  })

  it('customProjects 更新時に未変更プロジェクトの参照を維持する', async () => {
    const prevP1 = createProject({
      id: 'project-1',
      name: 'P1',
      urlIds: ['url-1'],
      urlMetadata: {
        'url-1': {
          category: 'Work',
        },
      },
      urls: [
        {
          url: 'https://a.example.com',
          title: 'A',
          category: 'Work',
        },
      ],
    })
    const prevP2 = createProject({ id: 'project-2', name: 'P2' })
    const ctx = createSyncContext({
      projects: [prevP1, prevP2],
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [
        createProject({
          id: 'project-1',
          name: 'P1',
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': {
              category: 'Work',
            },
          },
          urls: [
            {
              url: 'https://a.example.com',
              title: 'A',
              category: 'Work',
            },
          ],
        }),
        createProject({ id: 'project-2', name: 'P2 updated' }),
      ],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    const nextProjects = ctx.state.getProjects()
    expect(nextProjects[0]).toBe(prevP1)
    expect(nextProjects[1]).not.toBe(prevP2)
    expect(nextProjects[1]?.name).toBe('P2 updated')
  })

  it('保存済みタブ変更時は savedTabs を優先して同期し、urls 変更でキャッシュを無効化する', async () => {
    const ctx = createSyncContext()
    const nextSavedTabs: TabGroup[] = [
      {
        id: 'group-1',
        domain: 'https://example.com',
        urlIds: ['url-1'],
      },
    ]
    const savedTabsChange: TypedSavedTabsStorageChange = {
      key: 'savedTabs',
      kind: 'parsed',
      oldValue: [],
      payload: nextSavedTabs,
    }

    const events = await syncStorageChanges({
      ...ctx.args,
      changes: [savedTabsChange, createUrlsChange([])],
    })

    // 旧 `invalidateUrlCache()` の呼び出しは DDD 移行で撤去済み。
    // cache 無効化は不要（repository 経由の `findAll` は storage から都度読む）。
    expect(ctx.spies.refreshTabGroupsWithUrls).toHaveBeenCalledWith(
      nextSavedTabs,
    )
    expect(ctx.spies.refreshTabGroupsWithUrls).toHaveBeenCalledTimes(1)
    expect(ctx.spies.syncDomainDataToCustomProjects).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.type)).toStrictEqual([
      'savedTabsUpdated',
      'urlsUpdated',
    ])
  })

  it('urls/settings/categories 変更時に各 state を更新する', async () => {
    const initialSettings = {
      removeTabAfterOpen: false,
      removeTabAfterExternalDrop: false,
      excludePatterns: [],
      enableCategories: true,
      autoDeletePeriod: 'never',
      showSavedTime: false,
      clickBehavior: 'saveCurrentTab',
      excludePinnedTabs: false,
      openUrlInBackground: false,
      openAllInNewWindow: false,
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      colors: {},
    } as UserSettingsDto
    const ctx = createSyncContext({
      settings: initialSettings,
    })
    const nextCategories: ParentCategory[] = [
      {
        id: 'parent-1',
        name: 'Work',
        domains: [],
        domainNames: [],
      },
    ]
    const settingsChange: TypedSavedTabsStorageChange = {
      key: 'userSettings',
      kind: 'parsed',
      oldValue: {},
      payload: [{ removeTabAfterOpen: true }],
    }
    const categoriesChange: TypedSavedTabsStorageChange = {
      key: 'parentCategories',
      kind: 'parsed',
      oldValue: [],
      payload: nextCategories,
    }

    const events = await syncStorageChanges({
      ...ctx.args,
      changes: [createUrlsChange([]), settingsChange, categoriesChange],
    })

    // 旧 `invalidateUrlCache()` の呼び出しは DDD 移行で撤去済み。
    // cache 無効化は不要（repository 経由の `findAll` は storage から都度読む）。
    expect(ctx.spies.refreshTabGroupsWithUrls).toHaveBeenCalledTimes(1)
    expect(ctx.spies.refreshTabGroupsWithUrls).toHaveBeenCalledWith()
    expect(ctx.spies.syncDomainDataToCustomProjects).not.toHaveBeenCalled()
    expect(ctx.state.getSettings().removeTabAfterOpen).toBe(true)
    expect(ctx.state.getCategories()).toStrictEqual(nextCategories)
    expect(events.map((event) => event.type)).toStrictEqual([
      'urlsUpdated',
      'settingsUpdated',
      'categoriesUpdated',
    ])
  })

  it('customProjectOrder が既存IDを含まない場合は配列参照を維持する', async () => {
    const initialProjects = [
      createProject({ id: 'project-1' }),
      createProject({ id: 'project-2' }),
    ]
    const ctx = createSyncContext({
      projects: initialProjects,
    })

    const orderChange: TypedSavedTabsStorageChange = {
      key: 'customProjectOrder',
      kind: 'parsed',
      oldValue: undefined,
      payload: ['missing-project'],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [orderChange],
    })

    expect(ctx.state.getProjects()).toBe(initialProjects)
  })

  it('カスタムモード以外では customProjects 変更を反映しない', async () => {
    const initialProjects = [createProject({ id: 'project-1', name: 'P1' })]
    const ctx = createSyncContext({
      mode: 'domain',
      projects: initialProjects,
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [createProject({ id: 'project-1', name: 'P1 updated' })],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    expect(ctx.spies.setCustomProjects).not.toHaveBeenCalled()
    expect(ctx.state.getProjects()).toBe(initialProjects)
  })

  it('customProjects payload が空配列の場合は空配列で反映する (port 段階でスキップ済)', async () => {
    const ctx = createSyncContext({
      projects: [createProject({ id: 'project-1' })],
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    expect(ctx.state.getProjects()).toStrictEqual([])
  })

  it('urlMetadata のキー数が異なる場合は参照を維持しない', async () => {
    const prev = createProject({
      id: 'project-1',
      urlMetadata: {
        'url-1': {
          category: 'Work',
        },
      },
    })
    const ctx = createSyncContext({
      projects: [prev],
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [
        createProject({
          id: 'project-1',
          urlMetadata: {},
        }),
      ],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    expect(ctx.state.getProjects()[0]).not.toBe(prev)
  })

  it('urlMetadata のキー名が異なる場合は参照を維持しない', async () => {
    const prev = createProject({
      id: 'project-1',
      urlMetadata: {
        'url-a': {
          category: 'Work',
        },
      },
    })
    const ctx = createSyncContext({
      projects: [prev],
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [
        createProject({
          id: 'project-1',
          urlMetadata: {
            'url-b': {
              category: 'Work',
            },
          },
        }),
      ],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    expect(ctx.state.getProjects()[0]).not.toBe(prev)
  })

  it('urlMetadata のネスト値が異なる場合は参照を維持しない', async () => {
    const prev = createProject({
      id: 'project-1',
      urlMetadata: {
        'url-1': {
          category: 'Work',
        },
      },
    })
    const ctx = createSyncContext({
      projects: [prev],
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [
        createProject({
          id: 'project-1',
          urlMetadata: {
            'url-1': {
              category: 'Private',
            },
          },
        }),
      ],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    expect(ctx.state.getProjects()[0]).not.toBe(prev)
  })

  it('配列長が異なる場合は参照を維持しない', async () => {
    const prev = createProject({
      id: 'project-1',
      categories: ['Work'],
    })
    const ctx = createSyncContext({
      projects: [prev],
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [
        createProject({
          id: 'project-1',
          categories: [],
        }),
      ],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    expect(ctx.state.getProjects()[0]).not.toBe(prev)
  })

  it('配列要素が異なる場合は参照を維持しない', async () => {
    const prev = createProject({
      id: 'project-1',
      categories: ['Work'],
    })
    const ctx = createSyncContext({
      projects: [prev],
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [
        createProject({
          id: 'project-1',
          categories: ['Private'],
        }),
      ],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    expect(ctx.state.getProjects()[0]).not.toBe(prev)
  })

  it('savedTabs payload が空配列の場合は空配列で同期する (port 段階で空配列化済)', async () => {
    const ctx = createSyncContext()
    const savedTabsChange: TypedSavedTabsStorageChange = {
      key: 'savedTabs',
      kind: 'parsed',
      oldValue: [],
      payload: [],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [savedTabsChange],
    })

    expect(ctx.spies.refreshTabGroupsWithUrls).toHaveBeenCalledWith([])
    expect(ctx.spies.syncDomainDataToCustomProjects).toHaveBeenCalledTimes(1)
  })

  it('userSettings payload が空配列の場合は既存設定を維持する (port 段階で undefined→空配列化済)', async () => {
    const initialSettings = {
      removeTabAfterOpen: false,
      colors: {},
    } as UserSettingsDto
    const ctx = createSyncContext({
      settings: initialSettings,
    })
    const settingsChange: TypedSavedTabsStorageChange = {
      key: 'userSettings',
      kind: 'parsed',
      oldValue: undefined,
      payload: [],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [settingsChange],
    })

    expect(ctx.state.getSettings()).toStrictEqual(initialSettings)
  })

  it('parentCategories payload が空配列の場合は空配列を設定する (port 段階で配列外→空配列化済)', async () => {
    const ctx = createSyncContext({
      categories: [
        {
          id: 'parent-1',
          name: 'Work',
          domains: [],
          domainNames: [],
        },
      ],
    })
    const categoriesChange: TypedSavedTabsStorageChange = {
      key: 'parentCategories',
      kind: 'parsed',
      oldValue: undefined,
      payload: [],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [categoriesChange],
    })

    expect(ctx.state.getCategories()).toStrictEqual([])
  })

  it('urlMetadata と urls が未定義でも等価なら参照を維持する', async () => {
    const prev = createProject({
      id: 'project-1',
      name: 'Same',
    })
    const ctx = createSyncContext({
      projects: [prev],
    })
    const projectsChange: TypedSavedTabsStorageChange = {
      key: 'customProjects',
      kind: 'parsed',
      oldValue: [],
      payload: [
        createProject({
          id: 'project-1',
          name: 'Same',
        }),
      ],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [projectsChange],
    })

    expect(ctx.state.getProjects()[0]).toBe(prev)
  })

  it('変更が空なら state を更新しない', async () => {
    const ctx = createSyncContext()
    const events = await syncStorageChanges({
      ...ctx.args,
      changes: [],
    })

    expect(events).toStrictEqual([])
    expect(ctx.spies.refreshTabGroupsWithUrls).not.toHaveBeenCalled()
    expect(ctx.spies.syncDomainDataToCustomProjects).not.toHaveBeenCalled()
    expect(ctx.spies.setSettings).not.toHaveBeenCalled()
    expect(ctx.spies.setCategories).not.toHaveBeenCalled()
    expect(ctx.spies.setCustomProjects).not.toHaveBeenCalled()
  })

  it('savedTabs payload に valid のみが port 段階で残ったケースを反映する', async () => {
    // port 段階 (`ChromeStorageChangeAdapter`) で壊れた要素は除外済みという
    // 前提で、service 側はその payload をそのまま同期する。
    const ctx = createSyncContext()
    const validGroup: TabGroup = {
      id: 'group-1',
      domain: 'https://example.com',
      urlIds: ['url-1'],
    }
    const savedTabsChange: TypedSavedTabsStorageChange = {
      key: 'savedTabs',
      kind: 'parsed',
      oldValue: [],
      payload: [validGroup],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [savedTabsChange],
    })

    expect(ctx.spies.refreshTabGroupsWithUrls).toHaveBeenCalledWith([
      validGroup,
    ])
    expect(ctx.spies.syncDomainDataToCustomProjects).toHaveBeenCalledTimes(1)
  })

  it('parentCategories payload に valid のみが port 段階で残ったケースを反映する', async () => {
    // port 段階で壊れた要素は除外済み、service 側は valid だけを反映する。
    const ctx = createSyncContext()
    const valid: ParentCategory = {
      id: 'parent-1',
      name: 'Work',
      domains: [],
      domainNames: [],
    }
    const categoriesChange: TypedSavedTabsStorageChange = {
      key: 'parentCategories',
      kind: 'parsed',
      oldValue: [],
      payload: [valid],
    }

    await syncStorageChanges({
      ...ctx.args,
      changes: [categoriesChange],
    })

    expect(ctx.state.getCategories()).toStrictEqual([valid])
  })
})
