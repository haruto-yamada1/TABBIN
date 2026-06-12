/**
 * `saved-tabs` ドメイン層で投げるドメイン例外。
 *
 * 値オブジェクトのバリデーション失敗、エンティティの不変条件違反、
 * ドメインサービスのルール違反など、純粋なドメインルールの破綻を表す。
 *
 * `code` で機械可読な分類を、`message` で人間可読な説明を保持する。
 * UI や infrastructure では `instanceof SavedTabsDomainError` で
 * ドメイン例外と外部例外を切り分けるために使う。
 *
 * @example
 * ```ts
 * throw new SavedTabsDomainError('URL は空文字列にできません', 'INVALID_URL')
 * ```
 */
export class SavedTabsDomainError extends Error {
  public readonly code: SavedTabsDomainErrorCode

  public constructor(message: string, code: SavedTabsDomainErrorCode) {
    super(message)
    this.name = 'SavedTabsDomainError'
    this.code = code
  }
}

/**
 * `SavedTabsDomainError` の分類コード。
 *
 * UI で error.code に応じたメッセージを出し分けたり、テストで
 * 期待エラーを判定したりするために使う。新しい分類が必要なときは
 * 追加し、安易な文字列リテラルを散らかさないこと。
 */
export type SavedTabsDomainErrorCode =
  | 'INVALID_URL'
  | 'INVALID_DOMAIN_NAME'
  | 'INVALID_CATEGORY_NAME'
  | 'INVALID_ID'
  | 'INVALID_SAVED_AT'
  | 'INVALID_TAB_GROUP'
  | 'INVALID_URL_RECORD'
  | 'INVALID_PARENT_CATEGORY'
  | 'INVALID_CUSTOM_PROJECT'
