import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

/**
 * `GetProjectUrlsUseCase` の戻り値要素型。
 *
 * `UrlRecord` に project 側の metadata (`notes` / `category`) を
 * 結合した presentation 形。`@/lib/storage/projects.getProjectUrls` の
 * 出力型を DDD 化した。
 */
export type ProjectUrlEntry = {
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
export type GetProjectUrlsUseCaseDeps = {
  readonly urlRecordRepository: UrlRecordRepository
  /**
   * `project.urlMetadata` を取得するために必要。`findAllRaw` を持つ
   * 実装（`ChromeCustomProjectRepository`）を想定。未実装モックでは
   * `urlMetadata` なしで動作する。
   */
  readonly customProjectRepository: CustomProjectRepository
}

type RawProjectUrl = NonNullable<CustomProjectRawSnapshot['urls']>[number]
type ProjectUrlMetadata = NonNullable<
  CustomProjectRawSnapshot['urlMetadata']
>[string]

const buildRawUrlsById = (
  urls: readonly RawProjectUrl[] | undefined,
): ReadonlyMap<string, RawProjectUrl> => {
  const rawUrlsById = new Map<string, RawProjectUrl>()
  for (const url of urls ?? []) {
    if (url.id !== undefined) {
      rawUrlsById.set(url.id, url)
    }
  }
  return rawUrlsById
}

const withMetadata = (
  entry: ProjectUrlEntry,
  metadata: ProjectUrlMetadata | undefined,
): ProjectUrlEntry => ({
  ...entry,
  ...(metadata?.notes !== undefined ? { notes: metadata.notes } : {}),
  ...(metadata?.category !== undefined ? { category: metadata.category } : {}),
})

const toEntryFromRaw = (
  id: string,
  rawUrl: RawProjectUrl,
  metadata: ProjectUrlMetadata | undefined,
): ProjectUrlEntry =>
  withMetadata(
    {
      id,
      savedAt: rawUrl.savedAt ?? 0,
      title: rawUrl.title,
      url: rawUrl.url,
    },
    metadata,
  )

const toEntryFromRecord = (
  record: UrlRecord,
  metadata: ProjectUrlMetadata | undefined,
): ProjectUrlEntry =>
  withMetadata(
    {
      id: record.id,
      savedAt: record.savedAt,
      title: record.title,
      url: record.url,
      ...(record.favIconUrl !== undefined
        ? { favIconUrl: record.favIconUrl }
        : {}),
    },
    metadata,
  )

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
    const rawUrlsById = buildRawUrlsById(targetRaw?.urls)
    const urlRecords = await Promise.all(
      urlIds.map(async (id) =>
        deps.urlRecordRepository.findById(createUrlRecordId(id)),
      ),
    )
    const entries: ProjectUrlEntry[] = []
    for (const [index, urlId] of urlIds.entries()) {
      const record = urlRecords[index]
      const rawUrl = rawUrlsById.get(urlId)
      const metadata = urlMetadata?.[urlId]
      if (record) {
        entries.push(toEntryFromRecord(record, metadata))
      } else if (rawUrl) {
        entries.push(toEntryFromRaw(urlId, rawUrl, metadata))
      }
    }
    return entries
  }
}
