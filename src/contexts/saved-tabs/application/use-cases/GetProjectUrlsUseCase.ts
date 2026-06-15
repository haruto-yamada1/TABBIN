import type { CustomProject } from '@/types/storage'

import type { CustomProjectRepository } from '../../domain/repositories/CustomProjectRepository'
import type { UrlRecordRepository } from '../../domain/repositories/UrlRecordRepository'
import { createUrlRecordId } from '../../domain/value-objects/UrlRecordId'

/**
 * `GetProjectUrlsUseCase` の戻り値要素型。
 *
 * `UrlRecord` に project 側の metadata (`notes` / `category`) を
 * 結合した presentation 形。`@/lib/storage/projects.getProjectUrls` の
 * 出力型を DDD 化した。
 */
export interface ProjectUrlEntry {
  readonly id: string
  readonly url: string
  readonly title: string
  readonly savedAt: number
  readonly favIconUrl?: string
  readonly notes?: string
  readonly category?: string
}

/**
 * `GetProjectUrlsUseCase` の関数型。`CustomProject` を引数に取り、
 * そのプロジェクトに紐づく URL エントリ配列を返す。
 *
 * 旧 `src/lib/storage/projects.getProjectUrls` の DDD use-case 化
 * (issue #509)。`urlIds` 未設定（=旧形式）のプロジェクトは空配列を返す。
 *
 * 引数 `project` は presentation/storage 形（`@/types/storage`）を採用
 * する。理由: presentation 層は storage shape で project を保持して
 * おり、use-case 入口で `unknown` 経由の cast が発生しないようにする
 * ため。`id` / `urlIds` / `urlMetadata` フィールドのみ参照する。
 */
export type GetProjectUrlsUseCase = (
  project: CustomProject,
) => Promise<ProjectUrlEntry[]>

/**
 * `GetProjectUrlsUseCase` が必要とする依存。
 */
export interface GetProjectUrlsUseCaseDeps {
  readonly urlRecordRepository: UrlRecordRepository
  /**
   * `project.urlMetadata` を取得するために必要。`findAllRaw` を持つ
   * 実装（`ChromeCustomProjectRepository`）を想定。未実装モックでは
   * `urlMetadata` なしで動作する。
   */
  readonly customProjectRepository: CustomProjectRepository
}

/**
 * `GetProjectUrlsUseCase` を生成する。
 *
 * 責務:
 * 1. `customProjectRepository.findAllRaw?.()` で
 *    `urlMetadata` を含む raw project を取得
 * 2. `project.urlIds` から `UrlRecordRepository.findById` で
 *    `UrlRecord` を解決
 * 3. 対応する `urlMetadata` の `notes` / `category` を結合して返す
 * 4. `urlIds` が無い旧形式プロジェクトは空配列を返す
 */
export const createGetProjectUrlsUseCase = (
  deps: GetProjectUrlsUseCaseDeps,
): GetProjectUrlsUseCase => {
  return async (project) => {
    const urlIds = [...(project.urlIds ?? [])]
    if (urlIds.length === 0) {
      return []
    }
    const raws = (await deps.customProjectRepository.findAllRaw?.()) ?? []
    const targetRaw = raws.find((raw) => raw.id === project.id)
    const urlMetadata = targetRaw?.urlMetadata
    const urlRecords = await Promise.all(
      urlIds.map((id) =>
        deps.urlRecordRepository.findById(createUrlRecordId(id)),
      ),
    )
    const entries: ProjectUrlEntry[] = []
    for (const record of urlRecords) {
      if (!record) {
        continue
      }
      const metadata = urlMetadata?.[record.id]
      const entry: ProjectUrlEntry = {
        id: record.id,
        savedAt: record.savedAt,
        title: record.title,
        url: record.url,
        ...(record.favIconUrl !== undefined
          ? { favIconUrl: record.favIconUrl }
          : {}),
        ...(metadata?.notes !== undefined ? { notes: metadata.notes } : {}),
        ...(metadata?.category !== undefined
          ? { category: metadata.category }
          : {}),
      }
      entries.push(entry)
    }
    return entries
  }
}
