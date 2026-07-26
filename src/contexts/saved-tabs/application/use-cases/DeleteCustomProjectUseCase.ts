import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type {
  CustomProjectRawSnapshot,
  CustomProjectRepository,
} from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

/**
 * `DeleteCustomProjectUseCase` の入力。
 *
 * 削除対象プロジェクトの ID のみを受け取る。プロジェクト内の URL は
 * 「未分類」プロジェクトへマージされ、storage 上から消えるわけではない
 * （旧 `lib/storage/projects.deleteCustomProject` の挙動を踏襲）。
 */
export type DeleteCustomProjectCommand = {
  readonly projectId: string
}

export type DeleteCustomProjectResult = {
  readonly all: readonly SavedTabsCustomProjectDto[]
}

export type DeleteCustomProjectUseCase = (
  command: DeleteCustomProjectCommand,
) => Promise<DeleteCustomProjectResult>

export type DeleteCustomProjectUseCaseDeps = {
  readonly customProjectRepository: CustomProjectRepository
  readonly uncategorizedProjectId: string
  /**
   * 現在時刻の取得 port。未分類プロジェクトを新規作成するときの
   * `createdAt` / `updatedAt` に使う（テスト時は固定時刻を返す stub
   * を注入して時刻依存を排除する）。
   */
  readonly clock: ClockPort
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
      target.id,
    )
    const uncategorizedRaw = uncategorized
      ? await findRawForId(deps.customProjectRepository, uncategorized.id)
      : undefined

    // PR #514 review P2: 未分類プロジェクトが storage に無い場合は、
    // URL マージ先が無くなるため target の URL が消える。
    // 旧挙動 (lib/storage/projects.deleteCustomProject) では
    // custom-uncategorized プロジェクトをこの分岐で常に作成していた
    // ので、ここでもその挙動を再現する。
    let merged: CustomProject
    let nextAll: CustomProject[]
    let mergedRawBase: CustomProjectRawSnapshot | undefined
    if (uncategorized) {
      merged = mergeEntityUncategorized(target, uncategorized)
      nextAll = all.map((project, index) => {
        if (index === targetIndex) {
          return project
        }
        if (project.id === uncategorized.id) {
          return merged
        }
        return project
      })
      if (uncategorizedRaw) {
        mergedRawBase = uncategorizedRaw
      } else {
        // issue #535 P2: uncategorized の raw が `findAllRaw` 結果に
        // 含まれない場合は entity を widen して mergedRawBase を作る。
        mergedRawBase = entityToRawSnapshot(merged)
      }
    } else {
      const timestamp = deps.clock.now()
      const createdUncategorized = createCustomProject({
        categories: [],
        createdAt: timestamp,
        id: deps.uncategorizedProjectId,
        name: '未分類',
        updatedAt: timestamp,
        urlIds: [],
      })
      merged = mergeEntityUncategorized(target, createdUncategorized)
      // PR #514 / Codex review: 旧 `findOrCreateUncategorizedProject` 経路を
      // 踏襲し、新規作成した uncategorized プロジェクトを `all` へ明示的に
      // push してから保存する (`all.map` だと createdUncategorized.id が
      // 一致しないため merged が保存されず target の URL が消える)。
      nextAll = all
        .map((project, index) => (index === targetIndex ? project : project))
        .concat(merged)
      mergedRawBase = entityToRawSnapshot(createdUncategorized)
    }
    const remaining = nextAll.filter(
      (project) => project.id !== command.projectId,
    )
    if (
      targetRaw &&
      deps.customProjectRepository.findAllRaw &&
      deps.customProjectRepository.restoreAllRaw
    ) {
      // issue #535 P2: rich フィールド（`urlMetadata` / `projectKeywords` /
      // `categoryOrder` / `urls`）は domain entity 境界で表現されないため、
      // `saveAll` 経路だと target の metadata が uncategorized 側に
      // 引き継がれずに消える。`restoreAllRaw` で merged raw を
      // そのまま書き戻し、entity 経由の save とは別経路で永続化する。
      const allRaws = await deps.customProjectRepository.findAllRaw()
      const otherRaws = allRaws.filter((raw) => raw.id !== command.projectId)
      const mergedRaw: CustomProjectRawSnapshot = mergeRawSnapshots(
        mergedRawBase,
        targetRaw,
      )
      const nextRaws: CustomProjectRawSnapshot[] = [
        ...otherRaws.filter((raw) => raw.id !== mergedRaw.id),
        mergedRaw,
      ]
      await deps.customProjectRepository.restoreAllRaw(nextRaws)
    } else {
      await deps.customProjectRepository.saveAll(remaining)
      if (targetRaw) {
        const removedSnapshot: CustomProjectRawSnapshot = {
          ...targetRaw,
          urlIds: target.urlIds,
          urls: targetRaw.urls,
          urlMetadata: targetRaw.urlMetadata,
          projectKeywords: targetRaw.projectKeywords,
          categoryOrder: targetRaw.categoryOrder,
        }
        void removedSnapshot
      }
    }
    return {
      all: remaining.map(toSavedTabsCustomProjectDto),
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

const entityToRawSnapshot = (
  project: CustomProject,
): CustomProjectRawSnapshot => ({
  categories: [...project.categories],
  createdAt: project.createdAt,
  id: project.id,
  name: project.name,
  updatedAt: project.updatedAt,
  ...(project.urlIds.length > 0 ? { urlIds: [...project.urlIds] } : {}),
})

/**
 * entity 同士の `CustomProject` URL マージ。rich フィールド
 * （`urlMetadata` / `projectKeywords` / `categoryOrder`）は entity
 * 境界で表現されないため、ここでは `urlIds` の和集合のみを更新する。
 * rich フィールドの引き継ぎは `mergeRawSnapshots` を併用して raw
 * 経路で永続化する (issue #535 P2)。
 */
const mergeEntityUncategorized = (
  target: CustomProject,
  uncategorized: CustomProject,
): CustomProject => {
  const targetUrlIds = target.urlIds
  if (targetUrlIds.length === 0) {
    return uncategorized
  }
  const existing = new Set(uncategorized.urlIds)
  const nextUrlIds = [...uncategorized.urlIds]
  for (const urlId of targetUrlIds) {
    if (!existing.has(urlId)) {
      existing.add(urlId)
      nextUrlIds.push(urlId)
    }
  }
  return {
    ...uncategorized,
    urlIds: nextUrlIds,
    updatedAt: target.updatedAt,
  }
}

// TODO(#557): urlIds/metadata のマージロジックを分割して複雑度を削減する。
// eslint-disable-next-line eslint/complexity
const mergeRawSnapshots = (
  base: CustomProjectRawSnapshot,
  target: CustomProjectRawSnapshot,
): CustomProjectRawSnapshot => {
  const baseUrlIds = base.urlIds ?? []
  const existing = new Set<string>(baseUrlIds)
  const nextUrlIds: string[] = [...baseUrlIds]
  // `addedUrlIds` は target から実際に追加された urlId 集合。
  // urlMetadata の上書き判定と urlIds の和集合計算で同じ集合を使い、
  // 「移動しなかった urlId には触らない」セマンティクスを保つ。
  const addedUrlIds: string[] = []
  for (const urlId of target.urlIds ?? []) {
    if (!existing.has(urlId)) {
      existing.add(urlId)
      nextUrlIds.push(urlId)
      addedUrlIds.push(urlId)
    }
  }
  const baseUrlMetadata = base.urlMetadata ?? {}
  const targetUrlMetadata = target.urlMetadata ?? {}
  // issue #535 P2 review (Codex): `urlId` が両方のプロジェクトに既に
  // 存在する場合 (= 移動しなかった URL) は base の metadata を保持する。
  // target の metadata は `addedUrlIds` に含まれる urlId のみ反映し、
  // 衝突で uncategorized 側の notes / category を上書きしないようにする。
  const targetMetadataForAdded: Record<
    string,
    { notes?: string; category?: string }
  > = {}
  for (const urlId of addedUrlIds) {
    if (Object.hasOwn(targetUrlMetadata, urlId)) {
      targetMetadataForAdded[urlId] = { ...targetUrlMetadata[urlId] }
    }
  }
  const mergedUrlMetadata: Record<
    string,
    { notes?: string; category?: string }
  > = {
    ...baseUrlMetadata,
    ...targetMetadataForAdded,
  }
  const baseUrls = base.urls ?? []
  const targetUrls = target.urls ?? []
  let urlsField: CustomProjectRawSnapshot['urls']
  if (baseUrls.length > 0 || targetUrls.length > 0) {
    // issue #535 P2 review (Codex): base.urls と target.urls を union で
    // マージし、`url` 文字列で dedupe する。base 側を先に登録してから
    // target の未収載エントリを追加することで、衝突時は base (uncategorized)
    // の display data を保持する。URL が消えることを防ぐのが目的で、
    // 衝突時の title / savedAt 解決は UrlRecordRepository 側が canonical。
    const urlMap = new Map<
      string,
      { url: string; title: string; id?: string; savedAt?: number }
    >()
    for (const entry of baseUrls) {
      urlMap.set(entry.url, { ...entry })
    }
    for (const entry of targetUrls) {
      if (!urlMap.has(entry.url)) {
        urlMap.set(entry.url, { ...entry })
      }
    }
    urlsField = Array.from(urlMap.values())
  }
  return {
    ...base,
    categoryOrder: base.categoryOrder ?? target.categoryOrder,
    projectKeywords: base.projectKeywords ?? target.projectKeywords,
    updatedAt: target.updatedAt,
    urlIds: nextUrlIds,
    urlMetadata: mergedUrlMetadata,
    ...(urlsField ? { urls: urlsField } : {}),
  }
}
