import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProjectId } from '@/contexts/saved-tabs/domain/value-objects/CustomProjectId'

/**
 * undo 用途の生 snapshot shape。
 *
 * domain entity 化されない rich 補助フィールド
 * （`urls` / `urlMetadata` / `projectKeywords` / `categoryOrder`）を
 * 含めた storage 上の `customProjects` エントリを表現する。
 *
 * 実装 (`ChromeCustomProjectRepository` 等) は zod で parse した
 * 結果をこの shape で返す。domain interface は実装の zod スキーマへの
 * 直接依存を避けるため、structural な interface として公開する。
 */
export interface CustomProjectRawSnapshot {
  id: string
  name: string
  categories: readonly string[]
  createdAt: number
  updatedAt: number
  urlIds?: readonly string[]
  urls?: readonly {
    id?: string
    url: string
    title: string
    savedAt?: number
  }[]
  urlMetadata?: Readonly<Record<string, { notes?: string; category?: string }>>
  projectKeywords?: {
    urlKeywords: readonly string[]
    titleKeywords: readonly string[]
    domainKeywords: readonly string[]
  }
  categoryOrder?: readonly string[]
}

/**
 * `CustomProject` の永続化責務だけを抽出した repository interface。
 *
 * プロジェクト単位での URL 集約 (`urlIds` / `categories` / `createdAt` /
 * `updatedAt`) の読み書きと、表示順 (`order`) の読み書きだけを
 * domain interface に閉じ込める。並び替え・カテゴリ追加・URL 追加などは
 * use-case 側で表現する。
 *
 * `order` は `CustomProject` 集合とは独立した「表示用の並び順」であり、
 * 同じ ID を持つ `CustomProject` が storage 上から消えても `order` の
 * エントリは残ってよい。presentation 層は order を手掛かりに
 * `CustomProject` 配列を stable sort し、未知 ID は末尾へ送る / 無視する
 * などのフォールバックを行う。`saveOrder` は生 ID 配列をそのまま保存する
 * 素のマッピングに留め、storage key との対応は実装側に閉じる。
 *
 * `chrome.storage.local` の直接アクセスは禁止。実装は
 * `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/` 側に置く。
 *
 * `findAllRaw` / `restoreAllRaw` は undo 用途に domain entity 化できない
 * rich フィールド（`urls` / `urlMetadata` / `projectKeywords`）を含む
 * 生 storage shape を読み書きする。`saveAll` は entity ↔ raw の merge を
 * 伴うため、削除→undo のような「生 snapshot をそのまま書き戻す」場面で
 * `urls` / `urlMetadata` が脱落する。これを防ぐため undo 専用に raw
 * 入出力を公開する。
 *
 * @example
 * ```ts
 * const projects = await customProjectRepository.findAll()
 * const order = await customProjectRepository.findOrder()
 * const target = projects.find((project) => project.id === projectId)
 * ```
 */
export interface CustomProjectRepository {
  findAll: () => Promise<readonly CustomProject[]>
  findById: (id: CustomProjectId) => Promise<CustomProject | null>
  saveAll: (projects: readonly CustomProject[]) => Promise<void>
  removeByIds: (ids: readonly CustomProjectId[]) => Promise<void>
  findOrder: () => Promise<readonly CustomProjectId[]>
  saveOrder: (order: readonly CustomProjectId[]) => Promise<void>
  /**
   * undo 用の生 snapshot 取得。domain entity 化されない `urls` /
   * `urlMetadata` / `projectKeywords` を含む全フィールドを保持する。
   *
   * テスト等で未実装のモックは省略可能。presentation の undo handler
   * は存在チェックの上で呼び分ける。
   */
  findAllRaw?: () => Promise<readonly CustomProjectRawSnapshot[]>
  /**
   * undo 用の生 snapshot 書き戻し。merge を介さず snapshot をそのまま
   * chrome.storage に反映する。
   *
   * テスト等で未実装のモックは省略可能。presentation の undo handler
   * は存在チェックの上で呼び分ける。
   */
  restoreAllRaw?: (raws: readonly CustomProjectRawSnapshot[]) => Promise<void>
}
