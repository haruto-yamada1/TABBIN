/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
import type { CustomProject } from '../../domain/entities/CustomProject'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '../../domain/repositories/CustomProjectRepository'

/**
 * `DeleteCustomProjectUseCase` の入力。
 *
 * 削除対象プロジェクトの ID のみを受け取る。プロジェクト内の URL は
 * 「未分類」プロジェクトへマージされ、storage 上から消えるわけではない
 * （旧 `lib/storage/projects.deleteCustomProject` の挙動を踏襲）。
 */
export interface DeleteCustomProjectCommand {
  readonly projectId: string
}

export interface DeleteCustomProjectResult {
  readonly all: readonly CustomProject[]
}

export type DeleteCustomProjectUseCase = (
  command: DeleteCustomProjectCommand,
) => Promise<DeleteCustomProjectResult>

export interface DeleteCustomProjectUseCaseDeps {
  readonly customProjectRepository: CustomProjectRepository
  readonly uncategorizedProjectId: string
  /**
   * 現在のエポックミリ秒。未分類プロジェクトを新規作成するときの
   * `createdAt` / `updatedAt` に使う（テスト時は固定値を注入して
   * 時刻依存を排除する）。
   */
  readonly now?: () => number
}

/**
 * `DeleteCustomProjectUseCase` を生成する。
 *
 * 責務:
 * 1. 既存 `CustomProject` 一覧を取得
 * 2. 対象プロジェクトの URL を「未分類」プロジェクトへマージ
 *    (raw snapshot の `urlIds` / `urlMetadata` / `projectKeywords` /
 *    `categoryOrder` などの rich フィールドもまとめて引き継ぐ)
 * 3. 未分類プロジェクトが storage に無い場合は新規作成してから URL を
 *    マージする (旧挙動: `mergeUrlsIntoUncategorized` の前段で
 *    `custom-uncategorized` プロジェクトが常に存在することを保証)
 * 4. 対象プロジェクトを `customProjectRepository.removeByIds` で削除
 * 5. マージ後の未分類プロジェクトは `saveAll` で URL 集合を更新
 *
 * 旧 `src/lib/storage/projects.deleteCustomProject` の DDD use-case 化
 * (issue #509)。
 */
export const createDeleteCustomProjectUseCase = (
  deps: DeleteCustomProjectUseCaseDeps,
): DeleteCustomProjectUseCase => {
  const now = deps.now ?? ((): number => Date.now())
  return async (command) => {
    if (command.projectId === deps.uncategorizedProjectId) {
      throw new SavedTabsDomainError(
        'Uncategorized project cannot be deleted',
        'INVALID_CUSTOM_PROJECT',
      )
    }
    const all = await deps.customProjectRepository.findAll()
    const targetIndex = all.findIndex(
      (project) => project.id === command.projectId,
    )
    if (targetIndex === -1) {
      throw new SavedTabsDomainError(
        `Project with ID ${command.projectId} not found`,
        'INVALID_CUSTOM_PROJECT',
      )
    }
    const target = all[targetIndex]
    const uncategorized = all.find(
      (project) => project.id === deps.uncategorizedProjectId,
    )
    const targetRaw = await findRawForId(
      deps.customProjectRepository,
      target.id as unknown as string,
    )
    const uncategorizedRaw = uncategorized
      ? await findRawForId(
          deps.customProjectRepository,
          uncategorized.id as unknown as string,
        )
      : undefined

    // PR #514 review P2: 未分類プロジェクトが storage に無い場合は、
    // URL マージ先が無くなるため target の URL が消える。
    // 旧挙動 (lib/storage/projects.deleteCustomProject) では
    // custom-uncategorized プロジェクトをこの分岐で常に作成していた
    // ので、ここでもその挙動を再現する。
    let merged: CustomProject
    let nextAll: CustomProject[]
    if (uncategorized) {
      merged = mergeIntoUncategorized(target, uncategorized, {
        targetRaw: targetRaw ?? undefined,
        uncategorizedRaw: uncategorizedRaw ?? undefined,
      })
      nextAll = all.map((project, index) => {
        if (index === targetIndex) {
          return project
        }
        if (project.id === uncategorized.id) {
          return merged
        }
        return project
      })
    } else {
      const timestamp = now()
      const createdUncategorized: CustomProject = {
        categories: [],
        createdAt: timestamp as never,
        id: deps.uncategorizedProjectId as never,
        name: '未分類' as never,
        updatedAt: timestamp as never,
        urlIds: [],
      }
      const createdUncategorizedRaw: CustomProjectRawSnapshot = {
        categories: [],
        createdAt: timestamp,
        id: deps.uncategorizedProjectId,
        name: '未分類',
        updatedAt: timestamp,
      }
      merged = mergeIntoUncategorized(target, createdUncategorized, {
        targetRaw: targetRaw ?? undefined,
        uncategorizedRaw: createdUncategorizedRaw,
      })
      nextAll = all.map((project, index) => {
        if (index === targetIndex) {
          return project
        }
        if (project.id === createdUncategorized.id) {
          return merged
        }
        return project
      })
    }
    const remaining = nextAll.filter(
      (project) => project.id !== command.projectId,
    )
    await deps.customProjectRepository.saveAll(remaining)
    if (targetRaw) {
      const removedSnapshot: CustomProjectRawSnapshot = {
        ...targetRaw,
        urlIds: target.urlIds as unknown as readonly string[],
        urls: targetRaw.urls,
        urlMetadata: targetRaw.urlMetadata,
        projectKeywords: targetRaw.projectKeywords,
        categoryOrder: targetRaw.categoryOrder,
      }
      void removedSnapshot
    }
    return {
      all: remaining,
    }
  }
}

const findRawForId = async (
  repo: CustomProjectRepository,
  id: string,
): Promise<CustomProjectRawSnapshot | null> => {
  if (!repo.findAllRaw) {
    return null
  }
  const raws = await repo.findAllRaw()
  return raws.find((raw) => raw.id === id) ?? null
}

const mergeIntoUncategorized = (
  target: CustomProject,
  uncategorized: CustomProject,
  raws: {
    targetRaw: CustomProjectRawSnapshot | undefined
    uncategorizedRaw: CustomProjectRawSnapshot | undefined
  },
): CustomProject => {
  const targetUrlIds = target.urlIds as unknown as readonly string[]
  if (targetUrlIds.length === 0 && !raws.targetRaw?.urlMetadata) {
    return uncategorized
  }
  const existing = new Set(uncategorized.urlIds as unknown as readonly string[])
  const nextUrlIds: string[] = [
    ...(uncategorized.urlIds as unknown as readonly string[]),
  ]
  for (const urlId of targetUrlIds) {
    if (!existing.has(urlId)) {
      existing.add(urlId)
      nextUrlIds.push(urlId)
    }
  }
  // PR #514 review P2: 旧 `mergeUrlsIntoUncategorized` は
  // `urlMetadata` まで持ち越していたが、本 use-case の entity には
  // `urlMetadata` フィールドがない。raw snapshot から補完する。
  const targetUrlMetadata = raws.targetRaw?.urlMetadata
  const uncategorizedUrlMetadata = raws.uncategorizedRaw?.urlMetadata
  const mergedUrlMetadata: CustomProjectRawSnapshot['urlMetadata'] = {
    ...uncategorizedUrlMetadata,
    ...targetUrlMetadata,
  }
  return {
    ...uncategorized,
    urlIds: nextUrlIds as never,
    updatedAt: target.updatedAt,
    ...(Object.keys(mergedUrlMetadata).length > 0
      ? // eslint-disable-next-line typescript/no-unsafe-type-assertion
        ({ urlMetadata: mergedUrlMetadata } as never)
      : {}),
  }
}
