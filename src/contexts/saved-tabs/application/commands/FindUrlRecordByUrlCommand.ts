/**
 * `FindUrlRecordByUrlUseCase` の入力。
 *
 * URL 文字列から対応する `UrlRecordId` を逆引きしたいときに使う。
 * 旧 `getUrlRecords` を `find` で参照する形
 * （`urlRecords.find((record) => record.url === url)`）の
 * 等価物。presentation 層は use-case 経由で取得する
 * （issue #501）。
 */
export interface FindUrlRecordByUrlCommand {
  readonly url: string
}
