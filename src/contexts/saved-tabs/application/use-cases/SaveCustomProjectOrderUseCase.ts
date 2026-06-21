import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

/**
 * `SaveCustomProjectOrderUseCase` の入力。
 *
 * `newOrder` は表示順の `CustomProjectId` 配列。UI 側で並び替え後に
 * presentation hook から渡される。
 */
export interface SaveCustomProjectOrderCommand {
  readonly newOrder: readonly string[]
}

/**
 * `SaveCustomProjectOrderUseCase` の戻り値。
 *
 * 現状は副作用完了だけを表す `void` だが、`CustomProjectRepository` 側で
 * 将来的に「保存後の order を含んだ entity 配列」を返すようになっても
 * 影響を閉じ込められるよう、interface を切って export しておく。
 */
export type SaveCustomProjectOrderUseCase = (
  command: SaveCustomProjectOrderCommand,
) => Promise<void>

/**
 * `SaveCustomProjectOrderUseCase` が依存する repository 群。
 */
export interface SaveCustomProjectOrderUseCaseDeps {
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `SaveCustomProjectOrderUseCase` を生成する (issue #538)。
 *
 * 責務は `customProjectRepository.saveOrder(newOrder)` を呼び出す
 * だけ。並び替えそのものは presentation hook 側で行い、確定した
 * 配列を use-case へ渡す。
 *
 * 旧 `useProjectManagement.handleReorderProjects` 内の
 * `customProjectRepository.saveOrder(...)` 直叩きを置換する。
 *
 * `newOrder` は UI 入力の都合で `readonly string[]` として受け取る。
 * `CustomProjectRepository.saveOrder` は branded `CustomProjectId` を
 * 要求するため、use-case 境界で `unknown` キャストを 1 度だけ行う
 * (storage 実装側は branded 検証に依存しない素のマッピング)。
 *
 * @example
 * ```ts
 * const saveCustomProjectOrder = createSaveCustomProjectOrderUseCase({
 *   customProjectRepository,
 * })
 * await saveCustomProjectOrder({ newOrder: ['project-1', 'project-2'] })
 * ```
 */
export const createSaveCustomProjectOrderUseCase = (
  deps: SaveCustomProjectOrderUseCaseDeps,
): SaveCustomProjectOrderUseCase => {
  return async (command) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const order = command.newOrder as unknown as Parameters<
      CustomProjectRepository['saveOrder']
    >[0]
    await deps.customProjectRepository.saveOrder(order)
  }
}
