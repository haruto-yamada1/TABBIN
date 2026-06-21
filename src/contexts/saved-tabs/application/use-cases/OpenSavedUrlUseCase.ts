import type { OpenSavedUrlCommand } from '@/contexts/saved-tabs/application/commands/OpenSavedUrlCommand'
import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { OpenedUrlDto } from '@/contexts/saved-tabs/application/dto/OpenedUrlDto'
import type { BrowserTabPort } from '@/contexts/saved-tabs/application/ports/BrowserTabPort'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import {
  decideUrlRecordIdsToRemoveAfterOpen,
  removeUrlRecordIdsFromTabGroups,
} from '@/contexts/saved-tabs/domain/services/OpenedUrlRemovalPolicy'
import type { UrlReferenceOrigin } from '@/contexts/saved-tabs/domain/services/UrlReferenceService'
import { isUrlRecordReferencedElsewhere } from '@/contexts/saved-tabs/domain/services/UrlReferenceService'

/**
 * `OpenSavedUrlUseCase` が依存する repository / port 群。
 */
export interface OpenSavedUrlUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
  readonly customProjectRepository: CustomProjectRepository
  readonly browserTabPort: BrowserTabPort
}

/**
 * `OpenSavedUrlUseCase` の関数型。
 */
export type OpenSavedUrlUseCase = (
  command: OpenSavedUrlCommand,
) => Promise<OpenedUrlDto>

/**
 * `OpenSavedUrlUseCase` を生成する。
 *
 * 責務:
 * 1. 対象 `UrlRecord` を取得する。見つからなければ `SavedTabsDomainError` を投げる。
 * 2. `BrowserTabPort.open` で URL を開く。
 * 3. `decideUrlRecordIdsToRemoveAfterOpen` で削除対象 ID を判定する。
 * 4. 削除対象が含まれていれば、関連する `TabGroup` / `CustomProject` の
 *    `urlIds` から該当 ID を取り除く。`UrlRecord` 自体も、削除後に
 *    どこからも参照されなくなれば `UrlRecordRepository.removeByIds` で削除する。
 * 5. Undo 用 snapshot を `OpenedUrlDto` にまとめて返す。
 *
 * 設定 OFF（`removeTabAfterOpen=false` かつ `removeTabAfterExternalDrop=false`）
 * のときは副作用を実行せず、`removedUrlRecordId: null` /
 * `snapshot: null` の DTO を返す。
 */
export const createOpenSavedUrlUseCase = (
  deps: OpenSavedUrlUseCaseDeps,
): OpenSavedUrlUseCase => {
  return async (command) => {
    const [urlRecord, allTabGroups, allCustomProjects] = await Promise.all([
      deps.urlRecordRepository.findById(command.urlRecordId),
      deps.tabGroupRepository.findAll(),
      deps.customProjectRepository.findAll(),
    ])
    if (!urlRecord) {
      throw new SavedTabsDomainError(
        '対象 UrlRecord が見つかりません',
        'URL_RECORD_NOT_FOUND',
      )
    }

    const opened = await deps.browserTabPort.open({ url: urlRecord.url })

    const idsToRemove = decideUrlRecordIdsToRemoveAfterOpen({
      openedUrls: [{ origin: command.origin, urlRecordId: urlRecord.id }],
      settings: command.settings,
    })
    if (idsToRemove.size === 0) {
      return {
        openedUrl: opened.url,
        removedUrlRecord: null,
        removedUrlRecordId: null,
        snapshot: null,
      }
    }

    const previousTabGroups = allTabGroups
    const previousCustomProjects = allCustomProjects
    const previousUrlRecord = urlRecord

    const updatedTabGroups = removeUrlRecordIdsFromTabGroups({
      tabGroups: allTabGroups,
      urlRecordIdsToRemove: idsToRemove,
    })
    // CustomProject は空になっても削除せず保持する。
    // ユーザーがあとから手動で整理できるようにするため、副作用は最小化する。
    const updatedCustomProjects = previousCustomProjects.map((project) => {
      const remaining = project.urlIds.filter(
        (urlId) => !idsToRemove.has(urlId),
      )
      if (remaining.length === project.urlIds.length) {
        return project
      }
      return { ...project, urlIds: remaining }
    })

    const urlRecordIdsToDelete = new Set<typeof urlRecord.id>()
    for (const id of idsToRemove) {
      const origin: UrlReferenceOrigin | undefined = (() => {
        const fromGroup = previousTabGroups.find((group) =>
          group.urlIds.includes(id),
        )
        if (fromGroup) {
          return { id: fromGroup.id, kind: 'tabGroup' as const }
        }
        const fromProject = previousCustomProjects.find((project) =>
          project.urlIds.includes(id),
        )
        if (fromProject) {
          return { id: fromProject.id, kind: 'customProject' as const }
        }
        return undefined
      })()
      if (
        !isUrlRecordReferencedElsewhere({
          customProjects: previousCustomProjects,
          origin,
          tabGroups: previousTabGroups,
          urlRecordId: id,
        })
      ) {
        urlRecordIdsToDelete.add(id)
      }
    }

    if (updatedTabGroups.length !== previousTabGroups.length) {
      await deps.tabGroupRepository.saveAll(updatedTabGroups)
    } else {
      // length が同じでも、グループ内の urlIds が変わった場合は
      // saveAll で書き戻す必要がある。`removeUrlRecordIdsFromTabGroups` は
      // 変更があったグループだけ新しい object を返すので reference 比較で
      // 検出できる。
      const hasTabGroupContentChanged = updatedTabGroups.some(
        (group, index) => group !== previousTabGroups[index],
      )
      if (hasTabGroupContentChanged) {
        await deps.tabGroupRepository.saveAll(updatedTabGroups)
      }
    }
    const hasCustomProjectChanged = updatedCustomProjects.some(
      (project, index) => project !== previousCustomProjects[index],
    )
    if (hasCustomProjectChanged) {
      await deps.customProjectRepository.saveAll(updatedCustomProjects)
    }
    if (urlRecordIdsToDelete.size > 0) {
      await deps.urlRecordRepository.removeByIds(
        Array.from(urlRecordIdsToDelete),
      )
    }

    const removedId = urlRecordIdsToDelete.has(urlRecord.id)
      ? urlRecord.id
      : null
    const removedRecord: typeof urlRecord | null =
      removedId !== null ? previousUrlRecord : null

    const snapshot: OpenedUrlsRestoreSnapshot = {
      customProjectOrder: undefined,
      customProjects: previousCustomProjects,
      parentCategories: undefined,
      savedTabs: previousTabGroups,
      urlRecords: removedRecord ? [previousUrlRecord] : [],
    }

    return {
      openedUrl: opened.url,
      removedUrlRecord: removedRecord,
      removedUrlRecordId: removedId,
      snapshot,
    }
  }
}
