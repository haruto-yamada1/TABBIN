import type { IdGeneratorPort } from '@/contexts/saved-tabs/application/ports/IdGeneratorPort'

/**
 * `crypto.randomUUID()` を `IdGeneratorPort` に適合させる adapter。
 *
 * ID 生成を `crypto.randomUUID()` に直接依存するのは infrastructure 層の
 * 責務であり、application / domain 層は本 adapter 経由で注入された
 * `IdGeneratorPort` を利用する。テストでは固定 ID を返す stub に差し替える。
 */
export const createSystemIdGenerator = (): IdGeneratorPort => ({
  generate: () => crypto.randomUUID(),
})
