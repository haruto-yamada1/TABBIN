/* eslint-disable max-lines-per-function, typescript/no-misused-promises */
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import type { CustomProject, TabGroup, UrlRecord } from '@/types/storage'

const mocks = vi.hoisted(() => {
  let uuidIndex = 0

  return {
// eslint-disable-next-line typescript/require-await
    migrateToUrlsStorage: vi.fn(async () => undefined),
    reset: () => {
      uuidIndex = 0
      mocks.uuid.mockClear()
      mocks.migrateToUrlsStorage.mockClear()
    },
    uuid: vi.fn(() => `uuid-${++uuidIndex}`),
  }
})

vi.mock('uuid', () => ({
  v4: mocks.uuid,
}))

vi.mock('./url-migration', () => ({
  migrateToUrlsStorage: mocks.migrateToUrlsStorage,
}))

interface StorageState {
  customProjectOrder?: string[]
  customProjects?: CustomProject[]
  savedTabs?: TabGroup[]
  urls?: UrlRecord[]
}

const createChromeStorageLocal = (state: StorageState) => ({
// eslint-disable-next-line typescript/require-await
  get: vi.fn(async (keys?: string | string[]) => {
    if (!keys) {
      return state
    }

    if (Array.isArray(keys)) {
      return Object.fromEntries(
        keys.map((key) => [key, state[key as keyof StorageState]]),
      )
    }

    return {
      [keys]: state[keys as unknown as keyof StorageState],
    }
  }),
// eslint-disable-next-line typescript/require-await
  set: vi.fn(async (value: Record<string, unknown>) => {
    Object.assign(state, value)
  }),
})

const createProject = (
  overrides: Partial<CustomProject> = {},
): CustomProject => ({
  id: overrides.id ?? 'project-1',
  name: overrides.name ?? 'Project 1',
  projectKeywords: overrides.projectKeywords ?? {
    titleKeywords: [],
    urlKeywords: [],
    domainKeywords: [],
  },
  urlIds: overrides.urlIds ?? [],
  categories: overrides.categories ?? [],
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? 1,
  urlMetadata: overrides.urlMetadata,
})

const loadModule = async () => {
  vi.resetModules()
  return import('./projects')
}

describe('projects storage', () => {
  beforeEach(() => {
    mocks.reset()
    vi.restoreAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1000)
  })

  it('internal helpers は project order と URL ID 削除 fallback を扱う', async () => {
    const state: StorageState = {
      customProjectOrder: ['project-1', 12 as unknown as string, 'project-2'],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome
    const projectWithoutUrlIds = createProject()
    delete projectWithoutUrlIds.urlIds
    const projectWithUrl = createProject({
      urlIds: ['url-1', 'url-2'],
      urlMetadata: {
        'url-1': {
          notes: 'drop',
        },
      },
    })

    const {
      addUrlIdToProject,
      ensureProjectMetadataEntry,
      getCustomProjectOrder,
      mergeUrlsIntoUncategorized,
      removeProjectIdFromOrder,
      removeUrlIdFromProject,
      removeUrlIdFromOtherProjects,
      setProjectUrlMetadata,
      updateProjectUrlIdsAndMetadata,
    } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getCustomProjectOrder()).resolves.toEqual([
      'project-1',
      'project-2',
    ])
    delete state.customProjectOrder
// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getCustomProjectOrder()).resolves.toEqual([])
    state.customProjectOrder = { invalid: true } as unknown as string[]
// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getCustomProjectOrder()).resolves.toEqual([])
    expect(removeUrlIdFromProject(projectWithoutUrlIds, 'url-1', 1000)).toBe(
      false,
    )
    expect(removeUrlIdFromProject(projectWithUrl, 'url-1', 1000)).toBe(true)
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(projectWithUrl).toEqual(
      expect.objectContaining({
        updatedAt: 1000,
        urlIds: ['url-2'],
        urlMetadata: {},
      }),
    )
    expect(addUrlIdToProject(projectWithUrl, 'url-2')).toBe(false)
    expect(addUrlIdToProject(projectWithUrl, 'url-3')).toBe(true)
    expect(
      removeUrlIdFromOtherProjects(
        [
          createProject({
            id: 'keep',
            urlIds: ['url-3'],
          }),
          projectWithUrl,
        ],
        'url-3',
        'keep',
        1001,
      ),
    ).toBe(true)
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(projectWithUrl.urlIds).toEqual(['url-2'])
    setProjectUrlMetadata(projectWithUrl, 'url-2')
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(projectWithUrl.urlMetadata).toEqual({})
    setProjectUrlMetadata(projectWithUrl, 'url-2', 'note')
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(projectWithUrl.urlMetadata).toEqual({
      'url-2': {
        category: undefined,
        notes: 'note',
      },
    })
    const metadataProject = createProject()
    ensureProjectMetadataEntry(metadataProject, 'url-1')
    ensureProjectMetadataEntry(metadataProject, 'url-1')
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(metadataProject.urlMetadata).toEqual({
      'url-1': {},
    })
    expect(
      updateProjectUrlIdsAndMetadata(metadataProject, new Set(['url-1'])),
    ).toBe(false)
    metadataProject.urlIds = ['url-1', 'url-2']
    metadataProject.urlMetadata = {
      'url-1': {
        notes: 'drop',
      },
    }
    expect(
      updateProjectUrlIdsAndMetadata(metadataProject, new Set(['url-1'])),
    ).toBe(true)
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(metadataProject).toEqual(
      expect.objectContaining({
        updatedAt: 1000,
        urlIds: ['url-2'],
        urlMetadata: {},
      }),
    )
    metadataProject.urlIds = ['url-2']
    expect(
      updateProjectUrlIdsAndMetadata(metadataProject, new Set(['url-2'])),
    ).toBe(true)
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(metadataProject.urlMetadata).toEqual({})
    const uncategorized = createProject({
      id: 'custom-uncategorized',
      urlIds: ['url-1'],
    })
    mergeUrlsIntoUncategorized(
      createProject({
        urlIds: [],
      }),
      uncategorized,
    )
    mergeUrlsIntoUncategorized(
      createProject({
        urlIds: ['url-1', 'url-2'],
        urlMetadata: {
          'url-2': {
            notes: 'move',
          },
        },
      }),
      uncategorized,
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(uncategorized.urlIds).toEqual(['url-1', 'url-2'])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(uncategorized.urlMetadata).toEqual({
      'url-2': {
        notes: 'move',
      },
    })

    state.customProjectOrder = { invalid: true } as unknown as string[]
    await removeProjectIdFromOrder('project-1')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual([])
  })

  it('project API は URL 未一致と metadata fallback を扱う', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'source',
          categories: ['old'],
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': {
              category: 'old',
              notes: 'move',
            },
          },
        }),
        createProject({
          id: 'target',
          urlIds: [],
          urlMetadata: {},
        }),
        createProject({
          id: 'plain',
          categories: ['old'],
          urlIds: ['url-2'],
        }),
      ],
      savedTabs: [
        {
          id: 'group-empty-after-delete',
          domain: 'https://docs.example.com',
          urlIds: ['url-1'],
        },
        {
          id: 'group-without-url-ids',
          domain: 'https://empty.example.com',
        },
      ],
      urls: [
        {
          id: 'url-1',
          url: 'https://docs.example.com/a',
          title: 'A',
          savedAt: 1,
        },
        {
          id: 'url-2',
          url: 'https://docs.example.com/b',
          title: 'B',
          savedAt: 2,
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      moveUrlBetweenCustomProjects,
      removeUrlFromCustomProject,
      removeUrlsFromCustomProject,
      renameCategoryInProject,
      reorderProjectUrls,
    } = await loadModule()

    await removeUrlFromCustomProject('source', 'https://docs.example.com/miss')
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': {
            category: 'old',
            notes: 'move',
          },
        },
      }),
    )

    await removeUrlsFromCustomProject('source', [
      'https://docs.example.com/miss',
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]?.urlIds).toEqual(['url-1'])

    await reorderProjectUrls('source', undefined)
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        urlIds: ['url-1'],
        urls: undefined,
      }),
    )

    await reorderProjectUrls('source', [
      {
        title: 'missing',
        url: 'https://docs.example.com/missing-order',
      },
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]?.urlIds).toEqual(['url-1'])

    await moveUrlBetweenCustomProjects(
      'source',
      'target',
      'https://docs.example.com/a',
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[1]).toEqual(
      expect.objectContaining({
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': {
            notes: 'move',
          },
        },
      }),
    )

    await renameCategoryInProject('plain', 'old', 'new')
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[2]).toEqual(
      expect.objectContaining({
        categories: ['new'],
        urlMetadata: undefined,
      }),
    )
  })

  it('removeUrlsFromCustomProject は URL ID 欠損と空グループ削除を扱う', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'without-url-ids',
        }),
        createProject({
          id: 'with-url',
          urlIds: ['url-1'],
        }),
      ],
      savedTabs: [
        {
          id: 'domain-group',
          domain: 'https://docs.example.com',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          url: 'https://docs.example.com/a',
          title: 'A',
          savedAt: 1,
        },
      ],
    }
    delete state.customProjects?.[0]?.urlIds
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { removeUrlsFromCustomProject } = await loadModule()

    await removeUrlsFromCustomProject('without-url-ids', [
      'https://docs.example.com/a',
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]?.urlIds).toEqual([])

    await removeUrlsFromCustomProject('with-url', [
      'https://docs.example.com/a',
    ])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[1]?.urlIds).toEqual([])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.savedTabs).toEqual([])
  })

  it('saveUrlsToCustomProjects は未分類から一致プロジェクトへURLを移す', async () => {
    const state: StorageState = {
      customProjectOrder: ['matched-project', 'custom-uncategorized'],
      customProjects: [
        createProject({
          id: 'matched-project',
          name: 'Matched',
          projectKeywords: {
            titleKeywords: [],
            urlKeywords: [],
            domainKeywords: ['docs.example.com'],
          },
        }),
        createProject({
          id: 'custom-uncategorized',
          name: '未分類',
          urlIds: ['url-1'],
        }),
      ],
      savedTabs: [],
      urls: [
        {
          id: 'url-1',
          url: 'https://docs.example.com/a',
          title: 'Doc',
          savedAt: 1,
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveUrlsToCustomProjects } = await loadModule()

    await saveUrlsToCustomProjects([
      {
        url: 'https://docs.example.com/a',
        title: 'Doc',
      },
    ])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'matched-project',
        urlIds: ['url-1'],
      }),
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: [],
      }),
    ])
  })

  it('addUrlToCustomProject は同じURLを他プロジェクトへ重複所属させない', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'source-project',
          name: 'Source',
          urlIds: ['url-1'],
        }),
        createProject({
          id: 'target-project',
          name: 'Target',
        }),
      ],
      savedTabs: [
        {
          id: 'domain-group',
          domain: 'https://docs.example.com',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          url: 'https://docs.example.com/a',
          title: 'Doc',
          savedAt: 1,
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlToCustomProject } = await loadModule()

    await addUrlToCustomProject(
      'target-project',
      'https://docs.example.com/a',
      'Doc',
    )

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'source-project',
        urlIds: [],
      }),
      expect.objectContaining({
        id: 'target-project',
        urlIds: ['url-1'],
      }),
    ])
  })

  it('getCustomProjects は不正データを除外し不足フィールドを補完して順序で返す', async () => {
    const validWithoutFields = {
      id: 'project-a',
      name: 'Project A',
    } as CustomProject
    const ordered = createProject({
      id: 'project-b',
      name: 'Project B',
      urlIds: ['url-b'],
    })
    const state: StorageState = {
      customProjectOrder: ['project-b'],
      customProjects: [
        validWithoutFields,
        null as unknown as CustomProject,
        { id: 'missing-name' } as CustomProject,
        ordered,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getCustomProjects } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getCustomProjects()).resolves.toEqual([
      expect.objectContaining({
        id: 'project-b',
        name: 'Project B',
      }),
      expect.objectContaining({
        categories: [],
        createdAt: 1000,
        id: 'project-a',
        name: 'Project A',
        updatedAt: 1000,
        urlIds: [],
      }),
    ])
    expect(state.customProjects).toHaveLength(2)
  })

  it('getCustomProjects は順序にないプロジェクトを後ろへ送る', async () => {
    const state: StorageState = {
      customProjectOrder: ['project-a'],
      customProjects: [
        createProject({ id: 'project-b', name: 'Project B' }),
        createProject({ id: 'project-a', name: 'Project A' }),
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getCustomProjects } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getCustomProjects()).resolves.toEqual([
      expect.objectContaining({ id: 'project-a' }),
      expect.objectContaining({ id: 'project-b' }),
    ])
  })

  it('getCustomProjects は順序リスト内のプロジェクトを未指定プロジェクトより前に保つ', async () => {
    const state: StorageState = {
      customProjectOrder: ['project-c', 'project-a'],
      customProjects: [
        createProject({ id: 'project-a', name: 'Project A' }),
        createProject({ id: 'project-b', name: 'Project B' }),
        createProject({ id: 'project-c', name: 'Project C' }),
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getCustomProjects } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getCustomProjects()).resolves.toEqual([
      expect.objectContaining({ id: 'project-c' }),
      expect.objectContaining({ id: 'project-a' }),
      expect.objectContaining({ id: 'project-b' }),
    ])
  })

  it('getCustomProjects は storage key が省略されても空配列を返す', async () => {
    const state: StorageState = {}
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getCustomProjects } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getCustomProjects()).resolves.toEqual([])
  })

  it('getProjectUrls はURL IDがなければ空配列、あればメタデータ付きで返す', async () => {
    const state: StorageState = {
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://example.test/one',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getProjectUrls } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getProjectUrls(createProject())).resolves.toEqual([])
    await expect(
      getProjectUrls(
        createProject({
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': {
              category: 'docs',
              notes: 'note',
            },
          },
        }),
      ),
// eslint-disable-next-line vitest/prefer-strict-equal
    ).resolves.toEqual([
      {
        category: 'docs',
        id: 'url-1',
        notes: 'note',
        savedAt: 1,
        title: 'One',
        url: 'https://example.test/one',
      },
    ])
  })

  it('getCustomProjects はストレージ取得に失敗したら空配列を返す', async () => {
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => {
            throw new Error('storage unavailable')
          }),
          set: vi.fn(),
        },
      },
    } as unknown as typeof chrome

    const { getCustomProjects } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getCustomProjects()).resolves.toEqual([])
  })

  it('saveCustomProjects は保存失敗を呼び出し元へ伝える', async () => {
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async () => {
            throw new Error('write unavailable')
          }),
        },
      },
    } as unknown as typeof chrome

    const { saveCustomProjects } = await loadModule()

    await expect(saveCustomProjects([createProject()])).rejects.toThrow(
      'write unavailable',
    )
  })

  it('createCustomProject は重複名を拒否し新規プロジェクトを先頭順序に保存する', async () => {
    const state: StorageState = {
      customProjectOrder: ['project-2'],
      customProjects: [
        createProject({ id: 'project-1', name: 'Alpha' }),
        createProject({ id: 'project-2', name: 'Beta' }),
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { createCustomProject } = await loadModule()

    await expect(createCustomProject('alpha')).rejects.toThrow(
      'DUPLICATE_PROJECT_NAME:alpha',
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(createCustomProject('Gamma')).resolves.toEqual(
      expect.objectContaining({
        id: 'uuid-1',
        name: 'Gamma',
        urlIds: [],
      }),
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual([
      'uuid-1',
      'project-2',
      'project-1',
    ])
  })

  it('createCustomProject は不正な順序データなら既存プロジェクト順だけで保存する', async () => {
    const state: StorageState = {
      customProjectOrder: ['invalid'] as unknown as string[],
      customProjects: [
        createProject({ id: 'project-1', name: 'Alpha' }),
        createProject({ id: 'project-2', name: 'Beta' }),
      ],
    }
    state.customProjectOrder = { invalid: true } as unknown as string[]
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { createCustomProject } = await loadModule()

    await createCustomProject('Gamma')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual([
      'uuid-1',
      'project-1',
      'project-2',
    ])
  })

  it('getOrCreateUncategorizedProject は未分類を作成して順序末尾に追加する', async () => {
    const state: StorageState = {
      customProjectOrder: ['project-1'],
      customProjects: [createProject()],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getOrCreateUncategorizedProject } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getOrCreateUncategorizedProject()).resolves.toEqual(
      expect.objectContaining({
        id: 'custom-uncategorized',
        name: '未分類',
      }),
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.map((project) => project.id)).toEqual([
      'project-1',
      'custom-uncategorized',
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual([
      'project-1',
      'custom-uncategorized',
    ])
  })

  it('getOrCreateUncategorizedProject は順序に未分類が既にあれば重複追加しない', async () => {
    const state: StorageState = {
      customProjectOrder: ['custom-uncategorized'],
      customProjects: [createProject()],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getOrCreateUncategorizedProject } = await loadModule()

    await getOrCreateUncategorizedProject()

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual(['custom-uncategorized'])
  })

  it('getOrCreateUncategorizedProject は不正な順序データから未分類順序を作る', async () => {
    const state: StorageState = {
      customProjectOrder: { invalid: true } as unknown as string[],
      customProjects: [createProject()],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getOrCreateUncategorizedProject } = await loadModule()

    await getOrCreateUncategorizedProject()

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual(['custom-uncategorized'])
  })

  it('getOrCreateUncategorizedProject は既存の未分類を再利用する', async () => {
    const existingUncategorized = createProject({
      id: 'custom-uncategorized',
      name: '未分類',
      urlIds: ['url-1'],
    })
    const state: StorageState = {
      customProjectOrder: ['custom-uncategorized'],
      customProjects: [existingUncategorized],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { getOrCreateUncategorizedProject } = await loadModule()

// eslint-disable-next-line vitest/prefer-strict-equal
    await expect(getOrCreateUncategorizedProject()).resolves.toEqual(
      existingUncategorized,
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([existingUncategorized])
  })

  it('addUrlsToUncategorizedProject は空/重複を除き既存URLを更新して他プロジェクトから移す', async () => {
    const state: StorageState = {
      customProjectOrder: ['source'],
      customProjects: [
        createProject({
          id: 'source',
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': {
              category: 'docs',
              notes: 'drop',
            },
          },
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Old',
          url: 'https://example.test/a',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlsToUncategorizedProject } = await loadModule()

    await addUrlsToUncategorizedProject([
      { title: 'Updated', url: ' https://example.test/a ' },
      { title: 'Duplicate ignored', url: 'https://example.test/a' },
      { title: 'New', url: 'https://example.test/b' },
      { title: 'Blank ignored', url: ' ' },
    ])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.urls).toEqual([
      {
        id: 'url-1',
        savedAt: 1000,
        title: 'Updated',
        url: 'https://example.test/a',
      },
      {
        id: 'uuid-1',
        savedAt: 1000,
        title: 'New',
        url: 'https://example.test/b',
      },
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'source',
        urlIds: [],
        urlMetadata: {},
      }),
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: ['url-1', 'uuid-1'],
      }),
    ])
  })

  it('saveUrlsToCustomProjects は空入力を無視し未一致 URL を未分類へ送る', async () => {
    const state: StorageState = {
      customProjectOrder: [],
      customProjects: [],
      urls: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { saveUrlsToCustomProjects } = await loadModule()

    await saveUrlsToCustomProjects([{ title: 'Blank', url: ' ' }])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([])

    await saveUrlsToCustomProjects([
      { title: 'Unmatched', url: 'https://unmatched.example/a' },
    ])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: ['uuid-1'],
      }),
    ])
  })

  it('addUrlsToUncategorizedProject は空入力を無視し既存未分類の不足フィールドを補完する', async () => {
    const uncategorized = createProject({
      id: 'custom-uncategorized',
      name: '未分類',
    })
    delete uncategorized.urlIds
    const state: StorageState = {
      customProjectOrder: ['custom-uncategorized'],
      customProjects: [uncategorized],
      urls: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlsToUncategorizedProject } = await loadModule()

    await addUrlsToUncategorizedProject([{ title: 'Blank', url: ' ' }])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.urls).toEqual([])

    await addUrlsToUncategorizedProject([
      { title: '', url: 'https://example.test/new' },
    ])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: ['uuid-1'],
      }),
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual(['custom-uncategorized'])
  })

  it('addUrlsToUncategorizedProject は既に未分類へある URL を重複追加しない', async () => {
    const state: StorageState = {
      customProjectOrder: ['custom-uncategorized'],
      customProjects: [
        createProject({
          id: 'custom-uncategorized',
          name: '未分類',
          urlIds: ['url-1'],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Old',
          url: 'https://example.test/existing',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlsToUncategorizedProject } = await loadModule()

    await addUrlsToUncategorizedProject([
      {
        title: 'Updated',
        url: 'https://example.test/existing',
      },
    ])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]?.urlIds).toEqual(['url-1'])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.urls?.[0]).toEqual(
      expect.objectContaining({
        id: 'url-1',
        savedAt: 1000,
        title: 'Updated',
      }),
    )
  })

  it('addUrlsToUncategorizedProject は既存 URL の title が空でも更新する', async () => {
    const state: StorageState = {
      customProjectOrder: ['custom-uncategorized'],
      customProjects: [
        createProject({
          id: 'custom-uncategorized',
          name: '未分類',
          urlIds: [],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: '',
          url: 'https://docs.example.com/a',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlsToUncategorizedProject } = await loadModule()

    await addUrlsToUncategorizedProject([
      {
        title: '',
        url: 'https://docs.example.com/a',
      },
    ])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]?.urlIds).toEqual(['url-1'])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.urls?.[0]).toEqual({
      id: 'url-1',
      savedAt: 1000,
      title: '',
      url: 'https://docs.example.com/a',
    })
  })

  it('addUrlToCustomProject は新規URLをドメインモードにも追加しメタデータを保存する', async () => {
    const state: StorageState = {
      customProjects: [createProject({ id: 'target' })],
      savedTabs: [],
      urls: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlToCustomProject } = await loadModule()

    await addUrlToCustomProject('target', 'https://docs.example.com/a', 'Doc', {
      category: 'docs',
      notes: 'note',
    })

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.urls).toEqual([
      {
        id: 'uuid-1',
        savedAt: 1000,
        title: 'Doc',
        url: 'https://docs.example.com/a',
      },
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'target',
        urlIds: ['uuid-1'],
        urlMetadata: {
          'uuid-1': {
            category: 'docs',
            notes: 'note',
          },
        },
      }),
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.savedTabs).toEqual([
      {
        domain: 'https://docs.example.com',
        id: 'uuid-2',
        savedAt: 1000,
        urlIds: ['uuid-1'],
      },
    ])
  })

  it('addUrlToCustomProject は既存ドメイングループの URL IDs を補完する', async () => {
    const target = createProject({ id: 'target' })
    delete target.urlIds
    const state: StorageState = {
      customProjects: [target],
      savedTabs: [
        {
          domain: 'https://docs.example.com',
          id: 'group-1',
        },
      ],
      urls: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlToCustomProject } = await loadModule()

    await addUrlToCustomProject('target', 'https://docs.example.com/a', '')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]?.urlIds).toEqual(['uuid-1'])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.savedTabs).toEqual([
      {
        domain: 'https://docs.example.com',
        id: 'group-1',
        urlIds: ['uuid-1'],
      },
    ])
  })

  it('addUrlToCustomProject は既存 URL の title fallback と重複追加なしを扱う', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          urlIds: ['url-1'],
        }),
      ],
      savedTabs: [
        {
          domain: 'https://docs.example.com',
          id: 'group-1',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: '',
          url: 'https://docs.example.com/a',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlToCustomProject } = await loadModule()

    await addUrlToCustomProject('target', 'https://docs.example.com/a', '')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        urlIds: ['url-1'],
        urlMetadata: undefined,
      }),
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.savedTabs).toEqual([
      {
        domain: 'https://docs.example.com',
        id: 'group-1',
        urlIds: ['url-1'],
      },
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.urls?.[0]).toEqual(
      expect.objectContaining({
        savedAt: 1000,
        title: '',
      }),
    )
  })

  it('addUrlToCustomProject は存在しないプロジェクトを拒否する', async () => {
    const state: StorageState = {
      customProjects: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addUrlToCustomProject } = await loadModule()

    await expect(
      addUrlToCustomProject('missing', 'https://docs.example.com/a', 'Doc'),
    ).rejects.toThrow('Project with ID missing not found')
  })

  it('removeUrlFromCustomProject はURLとメタデータを消し空のドメイングループも削除する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': {
              category: 'docs',
              notes: 'remove',
            },
          },
        }),
      ],
      savedTabs: [
        {
          domain: 'https://docs.example.com',
          id: 'group-1',
          urlIds: ['url-1'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Doc',
          url: 'https://docs.example.com/a',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { removeUrlFromCustomProject } = await loadModule()

    await removeUrlFromCustomProject('target', 'https://docs.example.com/a')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        urlIds: [],
        urlMetadata: {},
      }),
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.savedTabs).toEqual([])
  })

  it('removeUrlFromCustomProject は存在しないプロジェクトを拒否し同期失敗は握りつぶす', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          urlIds: ['url-1'],
        }),
      ],
      savedTabs: [
        {
          domain: 'https://docs.example.com',
          id: 'group-without-ids',
        },
        {
          domain: 'https://docs.example.com',
          id: 'group-with-ids',
          urlIds: ['url-1', 'url-2'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Doc',
          url: 'https://docs.example.com/a',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Other',
          url: 'https://docs.example.com/b',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { removeUrlFromCustomProject } = await loadModule()

    await expect(
      removeUrlFromCustomProject('missing', 'https://docs.example.com/a'),
    ).rejects.toThrow('Project with ID missing not found')

    await removeUrlFromCustomProject('target', 'https://docs.example.com/a')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.savedTabs).toEqual([
      {
        domain: 'https://docs.example.com',
        id: 'group-without-ids',
      },
      {
        domain: 'https://docs.example.com',
        id: 'group-with-ids',
        urlIds: ['url-2'],
      },
    ])

// eslint-disable-next-line typescript/unbound-method
    vi.mocked(chrome.storage.local.get)
// eslint-disable-next-line typescript/require-await
      .mockImplementationOnce(async (keys) => { // eslint-disable-line
        if (Array.isArray(keys)) {
          return Object.fromEntries(
            keys.map((key) => [key, state[key as keyof StorageState]]),
          )
        }
        return {
          [keys as unknown as string]: state[keys as unknown as keyof StorageState],
        }
      })
      .mockRejectedValueOnce(new Error('sync failed'))

    await expect(
      removeUrlFromCustomProject('target', 'https://docs.example.com/missing'),
    ).resolves.toBeUndefined()
  })

  it('bulk remove APIs はURL/ID指定でプロジェクトとドメインモードを同期削除する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          urlIds: ['url-1', 'url-2', 'url-3'],
          urlMetadata: {
            'url-1': { notes: 'one' },
            'url-2': { notes: 'two' },
            'url-3': { notes: 'three' },
          },
        }),
      ],
      savedTabs: [
        {
          domain: 'https://untouched.example.com',
          id: 'group-without-urlids',
        },
        {
          domain: 'https://docs.example.com',
          id: 'group-1',
          urlIds: ['url-1', 'url-2', 'url-3'],
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://docs.example.com/one',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Two',
          url: 'https://docs.example.com/two',
        },
        {
          id: 'url-3',
          savedAt: 3,
          title: 'Three',
          url: 'https://docs.example.com/three',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      removeUrlIdsFromAllCustomProjects,
      removeUrlsFromAllCustomProjects,
      removeUrlsFromCustomProject,
    } = await loadModule()

    await removeUrlsFromCustomProject('target', [
      'https://docs.example.com/one',
    ])
    await removeUrlsFromAllCustomProjects(['https://docs.example.com/two'])
    await removeUrlIdsFromAllCustomProjects(['url-3'])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        urlIds: [],
        urlMetadata: {},
      }),
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.savedTabs).toEqual([
      {
        domain: 'https://untouched.example.com',
        id: 'group-without-urlids',
      },
      {
        domain: 'https://docs.example.com',
        id: 'group-1',
        urlIds: ['url-2', 'url-3'],
      },
    ])
  })

  it('bulk remove APIs は空入力・対象なし・同期エラーを扱う', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          urlIds: ['url-1'],
        }),
      ],
      savedTabs: [
        {
          domain: 'https://docs.example.com',
          id: 'group-1',
        },
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://docs.example.com/one',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      removeUrlIdsFromAllCustomProjects,
      removeUrlFromAllCustomProjects,
      removeUrlsFromAllCustomProjects,
      removeUrlsFromCustomProject,
    } = await loadModule()

    await removeUrlsFromCustomProject('target', [])
    await removeUrlsFromCustomProject('target', ['https://example.test/none'])
    await removeUrlsFromAllCustomProjects([])
    await removeUrlsFromAllCustomProjects(['https://example.test/none'])
    await removeUrlIdsFromAllCustomProjects([])
    await removeUrlFromAllCustomProjects('https://example.test/none')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]?.urlIds).toEqual(['url-1'])

// eslint-disable-next-line typescript/unbound-method
    vi.mocked(chrome.storage.local.get)
// eslint-disable-next-line typescript/require-await
      .mockImplementationOnce(async (keys) => { // eslint-disable-line
        if (Array.isArray(keys)) {
          return Object.fromEntries(
            keys.map((key) => [key, state[key as keyof StorageState]]),
          )
        }
        return {
          [keys as unknown as string]: state[keys as unknown as keyof StorageState],
        }
      })
      .mockRejectedValueOnce(new Error('storage failed'))
    await expect(
      removeUrlsFromCustomProject('target', ['https://docs.example.com/one']),
    ).resolves.toBeUndefined()

    await expect(
      removeUrlsFromCustomProject('missing', ['https://docs.example.com/one']),
    ).rejects.toThrow('Project with ID missing not found')
  })

  it('bulk remove APIs はURL ID未定義や重複しないプロジェクトを保存しない', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'without-ids',
        }),
        createProject({
          id: 'without-overlap',
          urlIds: ['url-2'],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://docs.example.com/one',
        },
      ],
    }
    delete state.customProjects?.[0].urlIds
    const storage = createChromeStorageLocal(state)
    globalThis.chrome = {
      storage: {
        local: storage,
      },
    } as unknown as typeof chrome

    const {
      removeUrlIdsFromAllCustomProjects,
      removeUrlsFromAllCustomProjects,
    } = await loadModule()

    await removeUrlsFromAllCustomProjects(['https://docs.example.com/one'])
    await removeUrlIdsFromAllCustomProjects(['url-1'])

    expect(storage.set).not.toHaveBeenCalled()
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'without-ids',
        urlIds: [],
      }),
      expect.objectContaining({
        id: 'without-overlap',
        urlIds: ['url-2'],
      }),
    ])
  })

  it('bulk remove APIs はストレージエラーを握りつぶす', async () => {
    globalThis.chrome = {
      storage: {
        local: {
// eslint-disable-next-line typescript/require-await
          get: vi.fn(async () => {
            throw new Error('storage failed')
          }),
          set: vi.fn(),
        },
      },
    } as unknown as typeof chrome
    const {
      removeUrlIdsFromAllCustomProjects,
      removeUrlFromAllCustomProjects,
      removeUrlsFromAllCustomProjects,
    } = await loadModule()

    await expect(
      removeUrlFromAllCustomProjects('https://docs.example.com/one'),
    ).resolves.toBeUndefined()
    await expect(
      removeUrlsFromAllCustomProjects(['https://docs.example.com/one']),
    ).resolves.toBeUndefined()
    await expect(
      removeUrlIdsFromAllCustomProjects(['url-1']),
    ).resolves.toBeUndefined()
  })

  it('bulk remove APIs は保存時のエラーも握りつぶす', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          urlIds: ['url-1'],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://docs.example.com/one',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: {
          ...createChromeStorageLocal(state),
// eslint-disable-next-line typescript/require-await
          set: vi.fn(async () => {
            throw new Error('write failed')
          }),
        },
      },
    } as unknown as typeof chrome
    const {
      removeUrlIdsFromAllCustomProjects,
      removeUrlFromAllCustomProjects,
      removeUrlsFromAllCustomProjects,
    } = await loadModule()

    await expect(
      removeUrlFromAllCustomProjects('https://docs.example.com/one'),
    ).resolves.toBeUndefined()
    state.customProjects = [
      createProject({
        id: 'target',
        urlIds: ['url-1'],
      }),
    ]
    await expect(
      removeUrlsFromAllCustomProjects(['https://docs.example.com/one']),
    ).resolves.toBeUndefined()
    state.customProjects = [
      createProject({
        id: 'target',
        urlIds: ['url-1'],
      }),
    ]
    await expect(
      removeUrlIdsFromAllCustomProjects(['url-1']),
    ).resolves.toBeUndefined()

    state.customProjects = [
      createProject({
        id: 'target',
        urlIds: ['url-1'],
      }),
    ]
    await expect(
      removeUrlFromAllCustomProjects('https://docs.example.com/one', {
        throwOnError: true,
      }),
    ).rejects.toThrow('write failed')
    state.customProjects = [
      createProject({
        id: 'target',
        urlIds: ['url-1'],
      }),
    ]
    await expect(
      removeUrlsFromAllCustomProjects(['https://docs.example.com/one'], {
        throwOnError: true,
      }),
    ).rejects.toThrow('write failed')
    state.customProjects = [
      createProject({
        id: 'target',
        urlIds: ['url-1'],
      }),
    ]
    await expect(
      removeUrlIdsFromAllCustomProjects(['url-1'], {
        throwOnError: true,
      }),
    ).rejects.toThrow('write failed')
  })

  it('removeUrlFromAllCustomProjects は URL を全プロジェクトから削除し失敗時も throw しない', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': { notes: 'drop' },
          },
        }),
        createProject({
          id: 'other',
          urlIds: ['url-2'],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://docs.example.com/one',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Two',
          url: 'https://docs.example.com/two',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { removeUrlFromAllCustomProjects } = await loadModule()

    await removeUrlFromAllCustomProjects('https://docs.example.com/one')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        urlIds: [],
        urlMetadata: {},
      }),
    )

// eslint-disable-next-line typescript/unbound-method
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
      new Error('storage failed'),
    )
    await expect(
      removeUrlFromAllCustomProjects('https://docs.example.com/two'),
    ).resolves.toBeUndefined()
  })

  it('removeUrlFromAllCustomProjects は urlIds 欠損プロジェクトを変更せず対象だけ削除する', async () => {
    const withoutUrlIds = createProject({
      id: 'without-url-ids',
      name: 'Without URL IDs',
    })
    delete withoutUrlIds.urlIds
    const state: StorageState = {
      customProjects: [
        withoutUrlIds,
        createProject({
          id: 'project-2',
          name: 'Project 2',
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': {
              notes: 'note',
            },
          },
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Doc',
          url: 'https://docs.example.com/a',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { removeUrlFromAllCustomProjects } = await loadModule()

    await removeUrlFromAllCustomProjects('https://docs.example.com/a')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'without-url-ids',
      }),
      expect.objectContaining({
        id: 'project-2',
        updatedAt: 1000,
        urlIds: [],
        urlMetadata: {},
      }),
    ])
  })

  it('deleteCustomProject はURLとメモを未分類へ移して順序から削除する', async () => {
    const state: StorageState = {
      customProjectOrder: ['delete-me', 'custom-uncategorized'],
      customProjects: [
        createProject({
          id: 'delete-me',
          urlIds: ['url-1', 'url-2'],
          urlMetadata: {
            'url-1': { notes: 'keep note' },
            'url-2': { category: 'drop-category-only' },
          },
        }),
        createProject({
          id: 'custom-uncategorized',
          name: '未分類',
          urlIds: ['url-2'],
        }),
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { deleteCustomProject } = await loadModule()

    await deleteCustomProject('delete-me')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: ['url-2', 'url-1'],
        urlMetadata: {
          'url-1': {
            notes: 'keep note',
          },
        },
      }),
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual(['custom-uncategorized'])
  })

  it('deleteCustomProject は未分類の保護・存在確認・未分類作成を行う', async () => {
    const projectWithoutUrls = createProject({
      id: 'delete-me',
      urlIds: [],
    })
    const state: StorageState = {
      customProjectOrder: ['delete-me'],
      customProjects: [projectWithoutUrls],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { deleteCustomProject } = await loadModule()

    await expect(deleteCustomProject('custom-uncategorized')).rejects.toThrow(
      'Uncategorized project cannot be deleted',
    )
    await expect(deleteCustomProject('missing')).rejects.toThrow(
      'Project with ID missing not found',
    )
    await deleteCustomProject('delete-me')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: [],
      }),
    ])
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual(['custom-uncategorized'])
  })

  it('deleteCustomProject は未分類の不足 URL IDs を補完し重複とカテゴリだけのメタデータを飛ばす', async () => {
    const uncategorized = createProject({
      id: 'custom-uncategorized',
      name: '未分類',
    })
    delete uncategorized.urlIds
    const state: StorageState = {
      customProjectOrder: ['delete-me', 'custom-uncategorized'],
      customProjects: [
        createProject({
          id: 'delete-me',
          urlIds: ['url-1', 'url-2'],
          urlMetadata: {
            'url-1': { category: 'drop-category' },
            'url-2': { notes: 'keep note' },
          },
        }),
        uncategorized,
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { deleteCustomProject } = await loadModule()

    await deleteCustomProject('delete-me')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: ['url-1', 'url-2'],
        urlMetadata: {
          'url-2': {
            notes: 'keep note',
          },
        },
      }),
    ])
  })

  it('deleteCustomProject は未分類に重複 URL がある場合は追加しない', async () => {
    const state: StorageState = {
      customProjectOrder: ['delete-me', 'custom-uncategorized'],
      customProjects: [
        createProject({
          id: 'delete-me',
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': { notes: 'ignored duplicate note' },
          },
        }),
        createProject({
          id: 'custom-uncategorized',
          name: '未分類',
          urlIds: ['url-1'],
        }),
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { deleteCustomProject } = await loadModule()

    await deleteCustomProject('delete-me')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'custom-uncategorized',
        urlIds: ['url-1'],
        urlMetadata: undefined,
      }),
    ])
  })

  it('カテゴリ/並び順/名称/キーワード API は対象プロジェクトだけを更新する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          categories: ['old', 'keep'],
          categoryOrder: ['old', 'keep'],
          urlIds: ['url-1', 'url-2'],
          urlMetadata: {
            'url-1': { category: 'old' },
            'url-2': { category: 'keep' },
          },
        }),
        createProject({ id: 'other', name: 'Other' }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://example.test/one',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Two',
          url: 'https://example.test/two',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      addCategoryToProject,
      removeCategoryFromProject,
      renameCategoryInProject,
      reorderProjectUrls,
      setUrlCategory,
      updateCategoryOrder,
      updateCustomProjectName,
      updateProjectKeywords,
      updateProjectOrder,
    } = await loadModule()

    await addCategoryToProject('target', 'new')
    await addCategoryToProject('target', 'new')
    await setUrlCategory('target', 'https://example.test/two', 'new')
    await renameCategoryInProject('target', 'old', 'renamed')
    await removeCategoryFromProject('target', 'keep')
    await updateCategoryOrder('target', ['new', 'renamed'])
    await reorderProjectUrls('target', [
      { title: 'Two', url: 'https://example.test/two' },
      { title: 'One', url: 'https://example.test/one' },
    ])
    await updateCustomProjectName('target', 'Renamed Project')
    await updateProjectKeywords('target', {
      domainKeywords: ['example.test'],
      titleKeywords: ['One'],
      urlKeywords: ['two'],
    })
    await updateProjectOrder(['target', 'other'])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        categoryOrder: ['new', 'renamed'],
        categories: ['renamed', 'new'],
        name: 'Renamed Project',
        projectKeywords: {
          domainKeywords: ['example.test'],
          titleKeywords: ['One'],
          urlKeywords: ['two'],
        },
        urlIds: ['url-2', 'url-1'],
        urlMetadata: {
          'url-1': {
            category: 'renamed',
          },
          'url-2': {
            category: 'new',
          },
        },
      }),
    )
// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjectOrder).toEqual(['target', 'other'])
  })

  it('カテゴリ追加と削除は既存の categoryOrder とメタデータを更新する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          categories: ['old'],
          categoryOrder: ['old'],
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': { category: 'old' },
          },
        }),
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addCategoryToProject, removeCategoryFromProject } =
      await loadModule()

    await addCategoryToProject('target', 'new')
    await removeCategoryFromProject('target', 'old')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        categories: ['new'],
        categoryOrder: ['new'],
        urlMetadata: {
          'url-1': {
            category: undefined,
          },
        },
      }),
    )
  })

  it('カテゴリ追加は categoryOrder がない場合 categories から初期化する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          categories: [],
        }),
      ],
    }
    delete state.customProjects?.[0].categoryOrder
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addCategoryToProject } = await loadModule()

    await addCategoryToProject('target', 'new')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        categories: ['new'],
        categoryOrder: ['new'],
      }),
    )
  })

  it('カテゴリ追加は既存 categoryOrder に新カテゴリを追加する', async () => {
    const project = createProject({
      categories: ['Existing'],
      id: 'target',
    })
    project.categoryOrder = ['Existing']
    const state: StorageState = {
      customProjects: [project],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { addCategoryToProject } = await loadModule()

    await addCategoryToProject('target', 'Inbox')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        categories: ['Existing', 'Inbox'],
        categoryOrder: ['Existing', 'Inbox'],
      }),
    )
  })

  it('カテゴリ削除は categoryOrder と urlMetadata がない場合も保存する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          categories: ['old'],
        }),
      ],
    }
    delete state.customProjects?.[0].categoryOrder
    delete state.customProjects?.[0].urlMetadata
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { removeCategoryFromProject } = await loadModule()

    await removeCategoryFromProject('target', 'old')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        categories: [],
      }),
    )
    expect(state.customProjects?.[0].categoryOrder).toBeUndefined()
    expect(state.customProjects?.[0].urlMetadata).toBeUndefined()
  })

  it('カテゴリ/並び順 API は存在しないプロジェクトを拒否する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({ id: 'target' }),
        createProject({ id: 'other', name: 'Other' }),
      ],
      urls: [],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      addCategoryToProject,
      removeCategoryFromProject,
      reorderProjectUrls,
      setUrlCategory,
      updateCategoryOrder,
      updateCustomProjectName,
    } = await loadModule()

    await expect(addCategoryToProject('missing', 'new')).rejects.toThrow(
      'Project with ID missing not found',
    )
    await expect(removeCategoryFromProject('missing', 'old')).rejects.toThrow(
      'Project with ID missing not found',
    )
    await expect(
      setUrlCategory('missing', 'https://example.test/one', 'new'),
    ).rejects.toThrow('Project with ID missing not found')
    await expect(updateCategoryOrder('missing', [])).rejects.toThrow(
      'Project with ID missing not found',
    )
    await expect(reorderProjectUrls('missing', [])).rejects.toThrow(
      'Project with ID missing not found',
    )
    await expect(updateCustomProjectName('missing', 'Name')).rejects.toThrow(
      'Project with ID missing not found',
    )
    await expect(updateCustomProjectName('target', 'Other')).rejects.toThrow(
      'DUPLICATE_PROJECT_NAME:Other',
    )
    await expect(updateCustomProjectName('target', 'Project 1')).resolves.toBe( // eslint-disable-line
      undefined,
    )
  })

  it('setUrlCategory と reorderProjectUrls は不足メタデータと重複URLを扱う', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'target',
          urlIds: ['url-1', 'url-2', 'url-3'],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://example.test/same',
        },
        {
          id: 'url-2',
          savedAt: 2,
          title: 'Two',
          url: 'https://example.test/same',
        },
        {
          id: 'url-3',
          savedAt: 3,
          title: 'Three',
          url: 'https://example.test/other',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { reorderProjectUrls, setUrlCategory } = await loadModule()

    await setUrlCategory('target', 'https://example.test/same', 'same')
    await reorderProjectUrls('target', [
      { title: 'Same', url: 'https://example.test/same' },
      { title: 'Same Again', url: 'https://example.test/same' },
    ])

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects?.[0]).toEqual(
      expect.objectContaining({
        urlIds: ['url-1', 'url-2', 'url-3'],
        urlMetadata: {
          'url-1': {
            category: 'same',
          },
        },
      }),
    )
  })

  it('setUrlCategory は URL ID がないプロジェクトや該当 URL なしでも保存する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'empty',
          urlIds: [],
        }),
        createProject({
          id: 'target',
          urlIds: ['url-1'],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'One',
          url: 'https://example.test/one',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { setUrlCategory } = await loadModule()

    await setUrlCategory('empty', 'https://example.test/one', 'new')
    await setUrlCategory('target', 'https://example.test/missing', 'new')

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'empty',
        urlMetadata: undefined,
      }),
      expect.objectContaining({
        id: 'target',
        urlMetadata: undefined,
      }),
    ])
  })

  it('moveUrlBetweenCustomProjects はURLとメモを移動しエラー条件を扱う', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'source',
          urlIds: ['url-1'],
          urlMetadata: {
            'url-1': {
              category: 'source-category',
              notes: 'move note',
            },
          },
        }),
        createProject({
          id: 'target',
          urlIds: [],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Move',
          url: 'https://example.test/move',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { moveUrlBetweenCustomProjects } = await loadModule()

    await moveUrlBetweenCustomProjects(
      'source',
      'target',
      'https://example.test/move',
    )
    await moveUrlBetweenCustomProjects(
      'target',
      'target',
      'https://example.test/move',
    )

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'source',
        urlIds: [],
        urlMetadata: {},
      }),
      expect.objectContaining({
        id: 'target',
        urlIds: ['url-1'],
        urlMetadata: {
          'url-1': {
            notes: 'move note',
          },
        },
      }),
    ])
    await expect(
      moveUrlBetweenCustomProjects(
        'source',
        'target',
        'https://example.test/missing',
      ),
    ).rejects.toThrow('URL not found in source project')
  })

  it('moveUrlBetweenCustomProjects は移動先の URL IDs が未定義なら初期化する', async () => {
    const target = createProject({
      id: 'target',
    })
    delete target.urlIds
    const state: StorageState = {
      customProjects: [
        createProject({
          id: 'source',
          urlIds: ['url-1'],
        }),
        target,
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Move',
          url: 'https://example.test/move',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const { moveUrlBetweenCustomProjects } = await loadModule()

    await moveUrlBetweenCustomProjects(
      'source',
      'target',
      'https://example.test/move',
    )

// eslint-disable-next-line vitest/prefer-strict-equal
    expect(state.customProjects).toEqual([
      expect.objectContaining({
        id: 'source',
        urlIds: [],
      }),
      expect.objectContaining({
        id: 'target',
        urlIds: ['url-1'],
      }),
    ])
  })

  it('moveUrlBetweenCustomProjects は存在しないプロジェクト・重複先を拒否する', async () => {
    const state: StorageState = {
      customProjects: [
        createProject({
          categories: ['keep'],
          id: 'source',
          urlIds: ['url-1'],
        }),
        createProject({
          id: 'target',
          urlIds: ['url-1'],
        }),
      ],
      urls: [
        {
          id: 'url-1',
          savedAt: 1,
          title: 'Move',
          url: 'https://example.test/move',
        },
      ],
    }
    globalThis.chrome = {
      storage: {
        local: createChromeStorageLocal(state),
      },
    } as unknown as typeof chrome

    const {
      moveUrlBetweenCustomProjects,
      renameCategoryInProject,
      updateProjectKeywords,
      updateProjectOrder,
    } = await loadModule()

    await expect(
      moveUrlBetweenCustomProjects(
        'missing',
        'target',
        'https://example.test/move',
      ),
    ).rejects.toThrow('Source or target project not found')
    await expect(
      moveUrlBetweenCustomProjects(
        'source',
        'target',
        'https://example.test/move',
      ),
    ).rejects.toThrow('URL already exists in target project')

    state.customProjects = [
      createProject({
        categories: ['keep'],
        id: 'source',
        urlIds: ['url-1'],
      }),
      createProject({
        id: 'target',
      }),
    ]
    delete state.customProjects[1].urlIds
    state.urls = []

    await expect(
      moveUrlBetweenCustomProjects(
        'source',
        'target',
        'https://example.test/missing',
      ),
    ).rejects.toThrow('URL not found in source project')
    await expect(
      renameCategoryInProject('missing', 'old', 'new'),
    ).rejects.toThrow('Project with ID missing not found')
    await expect(
      renameCategoryInProject('source', 'old', 'keep'),
    ).rejects.toThrow('Category name keep already exists in project source')
    await expect(
      updateProjectKeywords('missing', {
        titleKeywords: [],
        urlKeywords: [],
        domainKeywords: [],
      }),
    ).rejects.toThrow('Project with ID missing not found')

// eslint-disable-next-line typescript/unbound-method
    const setMock = vi.mocked(chrome.storage.local.set)
    setMock.mockRejectedValueOnce(new Error('write failed'))
    await expect(updateProjectOrder(['source'])).rejects.toThrow('write failed')
  })
})
