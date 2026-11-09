/**
 * `OpenSavedUrlUseCase` の入力。
 *
 * `urlRecordId` は開く対象の `UrlRecord` を指す ID。`origin` は
 * `OpenedUrlRemovalPolicy` と同じ 'click' / 'externalDrop' のどちらかで、
 * 削除ポリシー（`removeTabAfterOpen` / `removeTabAfterExternalDrop`）
 * のどちらを参照するかを決める。
 *
 * @example
 * ```ts
 * const command: OpenSavedUrlCommand = {
 *   urlRecordId,
 *   origin: 'click',
 *   settings: { removeTabAfterOpen: true, removeTabAfterExternalDrop: false },
 * }
 * const result = await openSavedUrlUseCase(command)
 * ```
 */
export type OpenSavedUrlCommand = {
  readonly urlRecordId: string
  readonly origin: 'click' | 'externalDrop'
  /**
   * 開いたあとに保存タブから削除するかの設定値。
   * presentation 層の opt-out 値。削除には repository で再取得した設定も ON が必要。
   */
  readonly settings: {
    readonly removeTabAfterOpen: boolean
    readonly removeTabAfterExternalDrop: boolean
  }
}
