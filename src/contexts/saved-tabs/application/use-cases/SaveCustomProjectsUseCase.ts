import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

/**
 * `SaveCustomProjectsUseCase` の入力。
 *
 * `projects` は application DTO として受け取り、use-case 内で domain
 * entity に変換して保存する。
 */
export interface SaveCustomProjectsCommand {
  readonly projects: readonly SavedTabsCustomProjectDto[]
}

export type SaveCustomProjectsUseCase = (
  command: SaveCustomProjectsCommand,
) => Promise<void>

/**
 * `SaveCustomProjectsUseCase` が依存する repository 群。
 */
export interface SaveCustomProjectsUseCaseDeps {
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `SaveCustomProjectsUseCase` を生成する (issue #538)。
 *
 * 責務は `customProjectRepository.saveAll(projects)` を呼び出す
 * だけ。rich フィールド (`urls` / `urlMetadata` / `projectKeywords` /
 * `categoryOrder`) は mapper 側で original raw から持ち越される
 * ため、entity 形を渡しても rich フィールドが脱落しない。
 *
 * 旧 `useProjectManagement` の undo フォールバック
 * (`customProjectRepository.saveAll(payload.customProjects)`) を
 * 使うため use-case 経由で呼ぶ。
 *
 * 互換 raw 入出力 (`restoreAllRaw`) が必要なら
 * `RestoreCustomProjectsSnapshotUseCase` 側を優先する。
 *
 * @example
 * ```ts
 * const saveCustomProjects = createSaveCustomProjectsUseCase({
 *   customProjectRepository,
 * })
 * await saveCustomProjects({ projects })
 * ```
 */
export const createSaveCustomProjectsUseCase = (
  deps: SaveCustomProjectsUseCaseDeps,
): SaveCustomProjectsUseCase => {
  return async (command) => {
    await deps.customProjectRepository.saveAll(
      command.projects.map(createCustomProject),
    )
  }
}

/**
 * `SaveCustomProjectsUseCase` で `saveAll` に渡せるよう、entity
 * (`CustomProject`) のうち undo 用に最低限必要なフィールドだけを
 * `CustomProjectRawSnapshot` 形へ widen するヘルパー。
 *
 * `urls` / `urlMetadata` / `projectKeywords` / `categoryOrder` は
 * entity 境界で表現されないため、ここでは widening できない。
 * rich フィールドを保持したまま永続化したい場合は
 * `RestoreCustomProjectsSnapshotUseCase` 経由で `restoreAllRaw` を
 * 使うこと。
 */
