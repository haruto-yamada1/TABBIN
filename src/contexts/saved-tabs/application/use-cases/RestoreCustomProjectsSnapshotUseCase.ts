import type { SavedTabsCustomProjectRawSnapshotDto } from '@/contexts/saved-tabs/application/dto/SavedTabsCustomProjectRawSnapshotDto'
import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toCustomProjectRawSnapshot } from '@/contexts/saved-tabs/application/mappers/SavedTabsCustomProjectRawSnapshotMapper'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import { createCustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'

/**
 * undo 復元で `RestoreCustomProjectsSnapshotUseCase` に渡す payload。
 *
 * `getCustomProjectUndoSnapshotQuery` の戻り値 (`CustomProjectUndoSnapshot`)
 * は「該当データが無いときフィールドが省略される optional」だが、
 * 復元用 payload では `customProjects` を必須とし、order / raw は
 * optional に固定する。order 省略時は `saveOrder([])` 相当の
 * 「全消去」セマンティクスを明示するため、呼び出し側で
 * `customProjectOrder ?? []` ではなく省略有無を意識する。
 */
export interface RestoreCustomProjectsSnapshotPayload {
  readonly customProjectOrder?: readonly string[]
  readonly customProjects: readonly SavedTabsCustomProjectDto[]
  readonly customProjectsRaw?: readonly SavedTabsCustomProjectRawSnapshotDto[]
}

/**
 * `RestoreCustomProjectsSnapshotUseCase` の入力。
 */
export interface RestoreCustomProjectsSnapshotCommand {
  readonly payload: RestoreCustomProjectsSnapshotPayload
}

/**
 * `RestoreCustomProjectsSnapshotUseCase` の戻り値。
 *
 * 副作用完了だけを表す `void`。
 */
export type RestoreCustomProjectsSnapshotUseCase = (
  command: RestoreCustomProjectsSnapshotCommand,
) => Promise<void>

/**
 * `RestoreCustomProjectsSnapshotUseCase` が依存する repository 群。
 */
export interface RestoreCustomProjectsSnapshotUseCaseDeps {
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `RestoreCustomProjectsSnapshotUseCase` を生成する (issue #538)。
 *
 * 責務:
 * 1. payload に `customProjectsRaw` があり repository 側に
 *    `restoreAllRaw` 実装があれば、それで生 snapshot をそのまま
 *    書き戻す (issue #535 P1: `urls` / `urlMetadata` /
 *    `projectKeywords` / `categoryOrder` などの rich フィールドを
 *    merge 介在なしで保持)
 * 2. それ以外は `customProjectRepository.saveAll(payload.customProjects)`
 *    にフォールバックする (`DeleteCustomProjectUseCase` と同じ挙動)
 * 3. 続けて `customProjectRepository.saveOrder(payload.customProjectOrder ?? [])`
 *    で表示順を書き戻す
 *
 * 旧 `useProjectManagement.showCustomProjectDeleteUndoToast` 内の
 * `restoreAllRaw` / `saveAll` / `saveOrder` 3 段呼び出しを 1 つの
 * use-case に統合する。
 *
 * @example
 * ```ts
 * const restoreCustomProjectsSnapshot = createRestoreCustomProjectsSnapshotUseCase({
 *   customProjectRepository,
 * })
 * await restoreCustomProjectsSnapshot({ payload: snapshot })
 * ```
 */
export const createRestoreCustomProjectsSnapshotUseCase = (
  deps: RestoreCustomProjectsSnapshotUseCaseDeps,
): RestoreCustomProjectsSnapshotUseCase => {
  return async (command) => {
    const { payload } = command
    if (
      payload.customProjectsRaw &&
      deps.customProjectRepository.restoreAllRaw
    ) {
      await deps.customProjectRepository.restoreAllRaw(
        payload.customProjectsRaw.map(toCustomProjectRawSnapshot),
      )
    } else {
      await deps.customProjectRepository.saveAll(
        payload.customProjects.map(createCustomProject),
      )
    }
    const order = (payload.customProjectOrder ?? []).map(createCustomProjectId)
    await deps.customProjectRepository.saveOrder(order)
  }
}
