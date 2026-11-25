/**
 * カスタムモードで選択した保存 URL の一括削除。
 * 対象プロジェクトに所属する URL だけを選び、ドメインと全プロジェクトの
 * 参照も同期削除する。プロジェクト間移動は別の command を使う。
 */
export type RemoveUrlsFromCustomProjectCommand = {
  readonly projectId: string
  readonly urls: readonly string[]
}
