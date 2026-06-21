import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'

/**
 * `UserSettingsDto` の永続化責務だけを抽出した repository interface。
 *
 * 旧 `src/lib/storage/settings.getUserSettings` / `saveUserSettings` の
 * 互換 API を DDD repository として再公開する。`chrome.storage.local`
 * への直接アクセスは禁止。実装は
 * `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/` 側に置く。
 *
 * `findAll` は保存済み設定が存在しない場合に domain 既定値を返す。
 * `save` は `chrome.storage.local` に書き戻し、merge / 正規化も
 * 実装側に閉じる。
 *
 * `@/types/storage` には依存せず、domain DTO `UserSettingsDto` を
 * 返す/受け取る (issue #511)。
 *
 * @example
 * ```ts
 * const settings = await userSettingsRepository.findAll()
 * await userSettingsRepository.save({ ...settings, removeTabAfterOpen: true })
 * ```
 */
export interface UserSettingsRepository {
  findAll: () => Promise<UserSettingsDto>
  save: (settings: UserSettingsDto) => Promise<void>
}
