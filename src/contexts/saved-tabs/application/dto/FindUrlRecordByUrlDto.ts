/**
 * `FindUrlRecordByUrlUseCase` の結果 DTO。
 *
 * URL に対応する `UrlRecord` が見つかったときだけ `record` / `urlRecordId`
 * をセットし、見つからなければ `null`。
 *
 * 旧 `getUrlRecords().find((record) => record.url === url)` の
 * 結果を use-case 経由に置き換えたもの（issue #501）。
 */
export interface FindUrlRecordByUrlDto {
  readonly record: {
    readonly id: string
    readonly url: string
    readonly title: string
  } | null
}
