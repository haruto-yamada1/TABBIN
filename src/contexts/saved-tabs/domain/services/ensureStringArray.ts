import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { SavedTabsDomainErrorCode } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'

export const ensureStringArray = (
  value: unknown,
  message: string,
  code: SavedTabsDomainErrorCode,
): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new SavedTabsDomainError(message, code)
  }
  const strings: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new SavedTabsDomainError(message, code)
    }
    strings.push(item)
  }
  return strings
}
