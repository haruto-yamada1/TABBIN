/**
 * ID 生成を application / infrastructure から注入するための port。
 *
 * domain / application 層は ID 生成 API を直接利用してはならず
 * (`.oxlintrc.json` の `no-restricted-properties` と
 * `dddLayerGuard.test.ts` で検出)。ID 生成が必要な use-case は本 port
 * 経由で `generate()` を呼び、テストでは固定 ID を返す stub に差し替える。
 *
 * 戻り値は UUID v4 形式の文字列とする。
 *
 * @example
 * ```ts
 * const id = idGenerator.generate()
 * ```
 */
export type IdGeneratorPort = {
  readonly generate: () => string
}
