import {
  createUrl,
  urlToString,
} from '@/contexts/saved-tabs/domain/value-objects/Url'

export const URL_IDENTITY_POLICY_VERSION = 'exact-url-v1'

/**
 * Validates a URL while preserving the exact source string as its identity.
 * Re-serializing with WHATWG URL would be a breaking identity migration.
 */
export const createUrlIdentityKey = (value: string): string =>
  urlToString(createUrl(value))

export const hasSameUrlIdentity = (left: string, right: string): boolean =>
  createUrlIdentityKey(left) === createUrlIdentityKey(right)
