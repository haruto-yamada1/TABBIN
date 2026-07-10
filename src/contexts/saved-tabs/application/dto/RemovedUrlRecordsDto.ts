/**
 * `RemoveUnreferencedUrlRecordsUseCase` の結果 DTO。
 *
 * 「どこからも参照されていない `UrlRecord` を N 件削除しました」を
 * 通知トーストで表示できるようにする想定。`removedCount` だけ
 * 通知すればよいケースと、ID 一覧が欲しいケースの両方に対応するため
 * 両方持つ。
 */
export type RemovedUrlRecordsDto = {
  readonly removedCount: number
  readonly removedUrlRecordIds: readonly string[]
}
