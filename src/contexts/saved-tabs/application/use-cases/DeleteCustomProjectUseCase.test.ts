import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'

import { createDeleteCustomProjectUseCase } from './DeleteCustomProjectUseCase'
import type { DeleteCustomProjectUseCaseDeps } from './DeleteCustomProjectUseCase'

const createInMemoryRepository = (
  initial: CustomProject[] = [],
  initialRaw: CustomProjectRawSnapshot[] = [],
): CustomProjectRepository => {
  let store: CustomProject[] = [...initial]
  const rawStore: CustomProjectRawSnapshot[] = [...initialRaw]
  return {
    // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    findAll: async () => store.map((project) => ({ ...project })),
    // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    findById: async (id) => store.find((project) => project.id === id) ?? null,
    // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    saveAll: async (projects) => {
      store = projects.map((project) => ({ ...project }))
    },
    // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    removeByIds: async (ids) => {
      const idSet = new Set(ids)
      store = store.filter((project) => !idSet.has(project.id))
    },
    // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    findOrder: async () => store.map((project) => project.id),
    // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    saveOrder: async () => undefined,
    // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    findAllRaw: async () => rawStore.map((raw) => ({ ...raw })),
    // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
    restoreAllRaw: async (raws) => {
      rawStore.length = 0
      rawStore.push(...raws.map((raw) => ({ ...raw })))
    },
  }
}

const baseTimestamp = 1_700_000_000_000
const createDeps = (
  repo: CustomProjectRepository,
): DeleteCustomProjectUseCaseDeps => ({
  clock: { now: () => baseTimestamp },
  customProjectRepository: repo,
  uncategorizedProjectId: 'custom-uncategorized',
})

describe('createDeleteCustomProjectUseCase', () => {
  let repo: CustomProjectRepository

  beforeEach(() => {
    repo = createInMemoryRepository([
      createCustomProject({
        categories: [],
        createdAt: baseTimestamp,
        id: 'project-1',
        name: 'Project 1',
        updatedAt: baseTimestamp,
        urlIds: ['url-1', 'url-2'],
      }),
      createCustomProject({
        categories: [],
        createdAt: baseTimestamp,
        id: 'custom-uncategorized',
        name: '未分類',
        updatedAt: baseTimestamp,
        urlIds: ['existing-url'],
      }),
    ])
  })

  it('対象プロジェクトを削除し、URL を未分類プロジェクトへマージする', async () => {
    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    const result = await useCase({
      projectId: createCustomProjectId('project-1'),
    })
    expect(result.all.map((p) => p.id)).toStrictEqual(['custom-uncategorized'])
    const uncategorized = result.all[0]
    expect(uncategorized?.urlIds).toStrictEqual([
      'existing-url',
      'url-1',
      'url-2',
    ])
  })

  it('未分類プロジェクトが storage に無い場合、新規作成して URL を保持する (Codex review P1)', async () => {
    // uncategorized を含まない状態を作る (P1 のバグが顕在化するシナリオ)
    repo = createInMemoryRepository([
      createCustomProject({
        categories: [],
        createdAt: baseTimestamp,
        id: 'project-1',
        name: 'Project 1',
        updatedAt: baseTimestamp,
        urlIds: ['url-1', 'url-2'],
      }),
    ])

    const useCase = createDeleteCustomProjectUseCase({
      ...createDeps(repo),
      clock: { now: () => baseTimestamp },
    })
    const result = await useCase({
      projectId: createCustomProjectId('project-1'),
    })

    // target プロジェクトが消えている
    expect(result.all.map((p) => p.id)).toStrictEqual(['custom-uncategorized'])
    // 新規作成された uncategorized に target の URL が保持されている
    const uncategorized = result.all[0]
    expect(uncategorized?.urlIds).toStrictEqual(['url-1', 'url-2'])
    expect(uncategorized?.name).toBe('未分類')
  })

  it('未分類プロジェクト自身を削除しようとすると SavedTabsDomainError を投げる', async () => {
    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await expect(
      useCase({ projectId: createCustomProjectId('custom-uncategorized') }),
    ).rejects.toThrow(SavedTabsDomainError)
  })

  it('存在しないプロジェクト ID を指定すると SavedTabsDomainError を投げる', async () => {
    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await expect(
      useCase({ projectId: createCustomProjectId('missing') }),
    ).rejects.toThrow(SavedTabsDomainError)
  })

  it('target の urlMetadata / projectKeywords / categoryOrder を uncategorized raw にマージして restoreAllRaw で書き戻す (issue #535 P2)', async () => {
    // target に rich フィールドを設定し、uncategorized にも一部
    // urlMetadata を入れておく。削除後、uncategorized 側に
    // target の rich フィールドが残ることを検証する。
    const baseTimestamp = 1_700_000_000_000
    repo = createInMemoryRepository(
      [
        createCustomProject({
          categories: ['research'],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1', 'url-2'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
        }),
      ],
      [
        {
          categories: ['research'],
          categoryOrder: ['research', 'news'],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          projectKeywords: {
            domainKeywords: ['example.com'],
            titleKeywords: ['design'],
            urlKeywords: ['plan'],
          },
          updatedAt: baseTimestamp,
          urlIds: ['url-1', 'url-2'],
          urlMetadata: {
            'url-1': { category: 'research', notes: 'note-1' },
            'url-2': { category: 'news', notes: 'note-2' },
          },
        },
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
          urlMetadata: {
            'existing-url': { category: 'archive' },
          },
        },
      ],
    )

    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    const result = await useCase({
      projectId: createCustomProjectId('project-1'),
    })

    // entity 戻り値: target が消え、uncategorized に URL がマージされる
    expect(result.all.map((p) => p.id)).toStrictEqual(['custom-uncategorized'])
    const uncategorized = result.all[0]
    expect(uncategorized?.urlIds).toStrictEqual([
      'existing-url',
      'url-1',
      'url-2',
    ])

    // raw store 側: uncategorized に target の urlMetadata /
    // projectKeywords / categoryOrder がマージされている
    if (!repo.findAllRaw) {
      throw new Error('findAllRaw is not implemented')
    }
    const rawAfter = await repo.findAllRaw()
    const uncategorizedRaw = rawAfter.find(
      (raw) => raw.id === 'custom-uncategorized',
    )
    expect(uncategorizedRaw).toBeDefined()
    // urlMetadata は base + target の和集合 (target が後勝ち上書き)
    expect(uncategorizedRaw?.urlMetadata).toStrictEqual({
      'existing-url': { category: 'archive' },
      'url-1': { category: 'research', notes: 'note-1' },
      'url-2': { category: 'news', notes: 'note-2' },
    })
    // projectKeywords / categoryOrder は target 側が引き継がれる
    expect(uncategorizedRaw?.projectKeywords).toStrictEqual({
      domainKeywords: ['example.com'],
      titleKeywords: ['design'],
      urlKeywords: ['plan'],
    })
    expect(uncategorizedRaw?.categoryOrder).toStrictEqual(['research', 'news'])
    // target は raw 側からも消えている
    expect(rawAfter.find((raw) => raw.id === 'project-1')).toBeUndefined()
  })

  it('urlId が両方のプロジェクトに既に存在する場合、base の urlMetadata を保持する (issue #535 P2 review)', async () => {
    // issue #535 P2 Codex review: 旧実装は `{ ...baseUrlMetadata,
    // ...targetUrlMetadata }` で衝突時も target の metadata を上書き
    // していた。`addedUrlIds` のみ target metadata を反映するように
    // 修正し、移動しなかった urlId では uncategorized 側の
    // notes / category を保持する。
    const baseTimestamp = 1_700_000_000_000
    repo = createInMemoryRepository(
      [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['shared-url', 'new-url'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['shared-url'],
        }),
      ],
      [
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['shared-url', 'new-url'],
          urlMetadata: {
            'new-url': { category: 'project-cat', notes: 'project-note' },
            'shared-url': { category: 'project-cat', notes: 'project-note' },
          },
        },
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['shared-url'],
          urlMetadata: {
            'shared-url': { category: 'uncat-cat', notes: 'uncat-note' },
          },
        },
      ],
    )

    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await useCase({ projectId: createCustomProjectId('project-1') })

    if (!repo.findAllRaw) {
      throw new Error('findAllRaw is not implemented')
    }
    const rawAfter = await repo.findAllRaw()
    const uncategorizedRaw = rawAfter.find(
      (raw) => raw.id === 'custom-uncategorized',
    )
    // shared-url は base (uncategorized) の metadata を保持
    // new-url は target の metadata が新規追加される
    expect(uncategorizedRaw?.urlMetadata).toStrictEqual({
      'new-url': { category: 'project-cat', notes: 'project-note' },
      'shared-url': { category: 'uncat-cat', notes: 'uncat-note' },
    })
  })

  it('target の urlIds が空のときは uncategorized をそのまま返す (entity 経路の空マージパス)', async () => {
    // raw 経路を通してもよいが、entity 経路 (`saveAll`) でマージロジックの
    // 早期 return 分岐 (target urlIds 空) を踏むケースを別途検証する。
    // ここでは `restoreAllRaw` を実装しない repository を使い、entity 経路に
    // 強制的に落とす。
    const baseTimestamp = 1_700_000_000_000
    const noRestoreRepo: CustomProjectRepository = {
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findAll: async () => [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-empty',
          name: 'Empty',
          updatedAt: baseTimestamp,
          urlIds: [],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
        }),
      ],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findById: async () => null,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      saveAll: async () => undefined,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      removeByIds: async () => undefined,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findOrder: async () => [],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      saveOrder: async () => undefined,
    }

    const useCase = createDeleteCustomProjectUseCase(createDeps(noRestoreRepo))
    const result = await useCase({
      projectId: createCustomProjectId('project-empty'),
    })
    expect(result.all.map((p) => p.id)).toStrictEqual(['custom-uncategorized'])
    // urlIds が空のため uncategorized の中身は変わらない
    expect(result.all[0]?.urlIds).toStrictEqual(['existing-url'])
  })

  it('findAllRaw が未実装の repository では entity 経路 (saveAll) にフォールバックする (issue #535 P1)', async () => {
    // `findAllRaw` / `restoreAllRaw` がない旧 repository で、P1 で導入した
    // raw 経路が `findAll` (entity) にフォールバックすることを検証する。
    const baseTimestamp = 1_700_000_000_000
    const noRawRepo: CustomProjectRepository = {
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findAll: async () => [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1', 'url-2'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
        }),
      ],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findById: async () => null,
      saveAll: vi.fn().mockResolvedValue(undefined),
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      removeByIds: async () => undefined,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findOrder: async () => [],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      saveOrder: async () => undefined,
    }

    const useCase = createDeleteCustomProjectUseCase(createDeps(noRawRepo))
    const result = await useCase({
      projectId: createCustomProjectId('project-1'),
    })
    // entity 経路 (saveAll) で書き戻される
    expect(noRawRepo.saveAll).toHaveBeenCalled()
    expect(result.all.map((p) => p.id)).toStrictEqual(['custom-uncategorized'])
    expect(result.all[0]?.urlIds).toStrictEqual([
      'existing-url',
      'url-1',
      'url-2',
    ])
  })

  it('findAllRaw のみあり restoreAllRaw がない repository では saveAll フォールバック + removedSnapshot 構築パスを通る', async () => {
    // `findAllRaw` は実装されているが `restoreAllRaw` が省略された
    // レガシー repository 互換。raw 経路を使えないので entity 経路
    // (saveAll) にフォールバックし、removedSnapshot 構築ブロック
    // (Line 162-170) を踏む。
    const baseTimestamp = 1_700_000_000_000
    const repoNoRestore: CustomProjectRepository = {
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findAll: async () => [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
        }),
      ],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findById: async () => null,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      saveAll: vi.fn().mockResolvedValue(undefined),
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      removeByIds: async () => undefined,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findOrder: async () => [],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      saveOrder: async () => undefined,
      // findAllRaw は実装するが restoreAllRaw は省略
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findAllRaw: async () => [
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        },
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
        },
      ],
    }

    const useCase = createDeleteCustomProjectUseCase(createDeps(repoNoRestore))
    const result = await useCase({
      projectId: createCustomProjectId('project-1'),
    })
    // restoreAllRaw 未実装 → saveAll 経路にフォールバック
    expect(repoNoRestore.saveAll).toHaveBeenCalled()
    expect(result.all.map((p) => p.id)).toStrictEqual(['custom-uncategorized'])
    expect(result.all[0]?.urlIds).toStrictEqual(['existing-url', 'url-1'])
  })

  it('base.urls のみある場合は base.urls を引き継ぐ (mergeRawSnapshots のフォールバック)', async () => {
    // issue #535 P2: target に urls が無く、base (uncategorized) に
    // urls がある場合は base.urls を mergedRaw に引き継ぐ。
    const baseTimestamp = 1_700_000_000_000
    repo = createInMemoryRepository(
      [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: [],
        }),
      ],
      [
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        },
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: [],
          urls: [
            {
              savedAt: baseTimestamp,
              title: 'Pre-existing',
              url: 'https://existing.example.com',
            },
          ],
        },
      ],
    )

    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await useCase({ projectId: createCustomProjectId('project-1') })

    if (!repo.findAllRaw) {
      throw new Error('findAllRaw is not implemented')
    }
    const rawAfter = await repo.findAllRaw()
    const uncategorizedRaw = rawAfter.find(
      (raw) => raw.id === 'custom-uncategorized',
    )
    // base (uncategorized) 側の urls が mergedRaw に引き継がれる
    expect(uncategorizedRaw?.urls).toStrictEqual([
      {
        savedAt: baseTimestamp,
        title: 'Pre-existing',
        url: 'https://existing.example.com',
      },
    ])
  })

  it('findAllRaw に uncategorized が無い場合、entityToRawSnapshot で mergedRawBase を widen する (Line 109 経路)', async () => {
    // uncategorized の raw が findAllRaw() の結果に含まれない場合、
    // `mergedRawBase = uncategorizedRaw ?? entityToRawSnapshot(merged)`
    // の `??` 右辺 (entity → raw widen) を踏む。
    // 同時に、`nextAll = all.map(...)` callback の default return (Line 109)
    // を踏むため、target / uncategorized 以外の project (project-3) を
    // `all` に含める。
    const baseTimestamp = 1_700_000_000_000
    const repo: CustomProjectRepository = {
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findAll: async () => [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-3',
          name: 'Project 3',
          updatedAt: baseTimestamp,
          urlIds: [],
        }),
      ],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findById: async () => null,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      saveAll: async () => undefined,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      removeByIds: async () => undefined,
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findOrder: async () => [],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      saveOrder: async () => undefined,
      // findAllRaw に uncategorized を含めない (Line 109 ?? の右辺を踏ませる)
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      findAllRaw: async () => [
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        },
      ],
      // eslint-disable-next-line typescript/require-await -- Promise contract は CustomProjectRepository 側で必須
      restoreAllRaw: vi.fn().mockResolvedValue(undefined),
    }

    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    const result = await useCase({
      projectId: createCustomProjectId('project-1'),
    })
    // restoreAllRaw が呼ばれる
    expect(repo.restoreAllRaw).toHaveBeenCalled()
    // mergedRaw には uncategorized が新規作成され、url-1 がマージされる。
    // project-3 はそのまま残る。
    expect(result.all.map((p) => p.id)).toStrictEqual([
      'custom-uncategorized',
      'project-3',
    ])
    expect(result.all[0]?.urlIds).toStrictEqual(['existing-url', 'url-1'])
  })

  it('target.urls と base.urls を union でマージし、url 文字列で dedupe する (issue #535 P2 review)', async () => {
    // issue #535 P2 Codex review: 旧実装は `if (target.urls)` 分岐で
    // target.urls を mergedRaw にそのまま採用しており、base.urls を
    // 完全に捨てていた。両者を union でマージし、url 文字列で dedupe
    // する (base 側が collision で勝つ)。URL 文字列が異なるエントリは
    // すべて mergedRaw に残る。
    const baseTimestamp = 1_700_000_000_000
    repo = createInMemoryRepository(
      [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: [],
        }),
      ],
      [
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
          urls: [
            {
              savedAt: baseTimestamp,
              title: 'Target',
              url: 'https://target.example.com',
            },
          ],
        },
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: [],
          urls: [
            {
              savedAt: baseTimestamp,
              title: 'Base',
              url: 'https://base.example.com',
            },
          ],
        },
      ],
    )

    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await useCase({ projectId: createCustomProjectId('project-1') })

    if (!repo.findAllRaw) {
      throw new Error('findAllRaw is not implemented')
    }
    const rawAfter = await repo.findAllRaw()
    const uncategorizedRaw = rawAfter.find(
      (raw) => raw.id === 'custom-uncategorized',
    )
    // base と target の url 文字列が異なるので両方が mergedRaw に残る
    expect(uncategorizedRaw?.urls).toStrictEqual([
      {
        savedAt: baseTimestamp,
        title: 'Base',
        url: 'https://base.example.com',
      },
      {
        savedAt: baseTimestamp,
        title: 'Target',
        url: 'https://target.example.com',
      },
    ])
  })

  it('target.urls と base.urls で同じ url 文字列が重複する場合は base を保持する (issue #535 P2 review)', async () => {
    // 同じ url 文字列が両方に存在する場合、base (uncategorized) の
    // エントリを保持し、target のエントリでは上書きしない。
    const baseTimestamp = 1_700_000_000_000
    repo = createInMemoryRepository(
      [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
        }),
      ],
      [
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
          urls: [
            {
              savedAt: baseTimestamp,
              title: 'Target Title',
              url: 'https://shared.example.com',
            },
          ],
        },
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: ['existing-url'],
          urls: [
            {
              savedAt: baseTimestamp - 1,
              title: 'Base Title',
              url: 'https://shared.example.com',
            },
          ],
        },
      ],
    )

    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await useCase({ projectId: createCustomProjectId('project-1') })

    if (!repo.findAllRaw) {
      throw new Error('findAllRaw is not implemented')
    }
    const rawAfter = await repo.findAllRaw()
    const uncategorizedRaw = rawAfter.find(
      (raw) => raw.id === 'custom-uncategorized',
    )
    // 同じ url 文字列は base 側を保持
    expect(uncategorizedRaw?.urls).toStrictEqual([
      {
        savedAt: baseTimestamp - 1,
        title: 'Base Title',
        url: 'https://shared.example.com',
      },
    ])
  })

  it('target と base のどちらにも urls が無い場合は urls キーを省く (mergeRawSnapshots の urls 省略)', async () => {
    // mergeRawSnapshots 内の `urlsField` が `target.urls` / `base.urls` の
    // どちらでも代入されないケース。mergedRaw には `urls` プロパティが
    // 付かない (Line 261 の urls 省略分岐)。
    const baseTimestamp = 1_700_000_000_000
    repo = createInMemoryRepository(
      [
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        }),
        createCustomProject({
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: [],
        }),
      ],
      [
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'project-1',
          name: 'Project 1',
          updatedAt: baseTimestamp,
          urlIds: ['url-1'],
        },
        {
          categories: [],
          createdAt: baseTimestamp,
          id: 'custom-uncategorized',
          name: '未分類',
          updatedAt: baseTimestamp,
          urlIds: [],
        },
      ],
    )

    const useCase = createDeleteCustomProjectUseCase(createDeps(repo))
    await useCase({ projectId: createCustomProjectId('project-1') })

    if (!repo.findAllRaw) {
      throw new Error('findAllRaw is not implemented')
    }
    const rawAfter = await repo.findAllRaw()
    const uncategorizedRaw = rawAfter.find(
      (raw) => raw.id === 'custom-uncategorized',
    )
    // urls キー自体は省略される
    expect(uncategorizedRaw).toBeDefined()
    expect(uncategorizedRaw).not.toHaveProperty('urls')
  })
})
