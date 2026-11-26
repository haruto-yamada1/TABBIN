import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { SavedTabsDomainErrorCode } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

/**
 * `unknown` のエラーが、指定した分類コードの `SavedTabsDomainError`
 * かどうかを判定する。
 *
 * presentation は domain の例外型を直接参照できない
 * (arch ルール `no-presentation-to-domain`) ため、コードによる
 * 出し分けが必要な場合はこのヘルパーを application 層から使う。
 */
export const hasSavedTabsDomainErrorCode = (
  error: unknown,
  code: SavedTabsDomainErrorCode,
): boolean => error instanceof SavedTabsDomainError && error.code === code
