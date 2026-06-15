import type { CustomProject } from '../../domain/entities/CustomProject'
import { SavedTabsDomainError } from '../../domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import { createCustomProjectId } from '../../domain/value-objects/CustomProjectId'

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

export type DeleteCustomProjectResult = {
  readonly all: readonly CustomProject[]
}

export type DeleteCustomProjectUseCase = (
  command: DeleteCustomProjectCommand,
) => Promise<DeleteCustomProjectResult>

export interface DeleteCustomProjectUseCaseDeps {
  readonly customProjectRepository: CustomProjectRepository
  readonly uncategorizedProjectId: string
}

/**
 * `DeleteCustomProjectUseCase` を生成する。
 *
 * 責務:
 * 1. 既存 `CustomProject` 一覧を取得
 * 2. 対象プロジェクトの URL を「未分類」プロジェクトへマージ
 * 3. 対象プロジェクトを `customProjectRepository.removeByIds` で削除
 * 4. 未分類プロジェクトは `saveAll` で URL 集合を更新
 *
 * 旧 `src/lib/storage/projects.deleteCustomProject` の DDD use-case 化
 * (issue #509)。mapper 経由で `categoryOrder` / `projectKeywords` などの
 * rich 補助フィールドは original raw から持ち越される。
 */
export const createDeleteCustomProjectUseCase = (
  deps: DeleteCustomProjectUseCaseDeps,
): DeleteCustomProjectUseCase => {
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
    let nextAll: CustomProject[]
    if (uncategorized) {
      const merged: CustomProject = mergeUrlsIntoUncategorized(
        target,
        uncategorized,
      )
      nextAll = all.map((project, index) =>
        index === targetIndex
          ? project
          : project.id === uncategorized.id
            ? merged
            : project,
      )
    } else {
      nextAll = [...all]
    }
    const remaining = nextAll.filter(
      (project) => project.id !== command.projectId,
    )
    if (uncategorized) {
      await deps.customProjectRepository.saveAll(remaining)
    } else {
      await deps.customProjectRepository.removeByIds([
        createCustomProjectId(command.projectId),
      ])
    }
    return {
      all: remaining,
    }
  }
}

const mergeUrlsIntoUncategorized = (
  target: CustomProject,
  uncategorized: CustomProject,
): CustomProject => {
  if (target.urlIds.length === 0) {
    return uncategorized
  }
  const existing = new Set(uncategorized.urlIds)
  const nextUrlIds = [...uncategorized.urlIds]
  for (const urlId of target.urlIds) {
    if (!existing.has(urlId)) {
      existing.add(urlId)
      nextUrlIds.push(urlId)
    }
  }
  return {
    ...uncategorized,
    urlIds: nextUrlIds,
  }
}
