import type { ReorderTabGroupsCommand } from '@/contexts/saved-tabs/application/commands/ReorderTabGroupsCommand'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'

/**
 * `ReorderTabGroupsUseCase` が依存する repository 群。
 *
 * テスト時は in-memory mock を注入する。`chrome.storage.local` への
 * 依存を排除した unit test を書けるように、interface のみを公開する。
 */
export interface ReorderTabGroupsUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
}

/**
 * `ReorderTabGroupsUseCase` の関数型。
 *
 * presentation / controller hook 側は `use-case` を直接 import せず、
 * composition 層で生成した関数を受け取って呼び出す形を推奨。
 */
export type ReorderTabGroupsUseCase = (
  command: ReorderTabGroupsCommand,
) => Promise<void>

/**
 * `ReorderTabGroupsUseCase` を生成する。
 *
 * 責務:
 * 1. UI 側で並び替えた `TabGroup[]` を `TabGroupRepository.saveAll`
 *    に委譲する。並び順の検証は UI 側（dnd-kit の arrayMove 出力）に
 *    委ねる。
 *
 * 旧 `SavedTabsApp.tsx` の
 * `chrome.storage.local.set({ savedTabs: newTabGroups })` を
 * repository 経由へ移す目的（issue #494）。
 */
export const createReorderTabGroupsUseCase = (
  deps: ReorderTabGroupsUseCaseDeps,
): ReorderTabGroupsUseCase => {
  return async (command) => {
    await deps.tabGroupRepository.saveAll(command.tabGroups.map(createTabGroup))
  }
}
