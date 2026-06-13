/**
 * 一意 ID 生成を抽象化する port。
 *
 * `UrlRecordId` / `TabGroupId` / `CustomProjectId` / `ParentCategoryId` などの
 * 採番は domain 層の責務外とし、本 port で生成した文字列を
 * 各 value-object の factory に渡して entity 化する。
 *
 * infrastructure 層が `CryptoRandomIdAdapter`（`crypto.randomUUID`）や
 * `NanoidAdapter`、テスト用の `SequentialIdAdapter` を提供することを想定。
 *
 * @example
 * ```ts
 * const id = idGeneratorPort.nextId() // 'url-1718275200000-a1b2c3'
 * const record = createUrlRecord({ id, url: '...', title: '...', savedAt: now })
 * ```
 */
export interface IdGeneratorPort {
  /**
   * 衝突しないことが期待される新しい ID 文字列を返す。
   *
   * 形式は実装依存（UUID v4 / nanoid / epoch + counter など）。
   * 空文字列を返してはならない。
   */
  nextId: () => string
}
