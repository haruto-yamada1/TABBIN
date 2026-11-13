import type { AiSavedUrlRecord } from '@/features/ai-chat/types'
import { getMessage } from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'

import { listSavedUrlPage } from './savedUrlQuery'

const UNTRUSTED_SAVED_URL_DATA_OPEN = '[BEGIN UNTRUSTED SAVED URL DATA]'
const UNTRUSTED_SAVED_URL_DATA_CLOSE = '[END UNTRUSTED SAVED URL DATA]'
const UNTRUSTED_MARKER_REPLACEMENT = '[untrusted marker removed]'
const MAX_UNTRUSTED_SAVED_URL_FIELD_LENGTH = 500
const RECENT_SAVED_URL_CONTEXT_LIMIT = 20

// Control, bidi, zero-width, and line-separator characters could make saved
// data look like new prompt instructions or spoof how the text is displayed.
const UNSAFE_UNTRUSTED_TEXT_CHARACTERS =
  // eslint-disable-next-line eslint/no-control-regex -- The control range is the boundary being normalized.
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g
const BOUNDARY_MARKER_PATTERN = /\[(?:BEGIN|END) UNTRUSTED SAVED URL DATA\]/gi

const truncateCodePoints = (value: string, maxLength: number): string => {
  const characters = Array.from(value)
  return characters.length <= maxLength
    ? value
    : characters.slice(0, maxLength).join('')
}

const sanitizeUntrustedSavedUrlText = (value: string): string =>
  truncateCodePoints(
    value
      .replace(UNSAFE_UNTRUSTED_TEXT_CHARACTERS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(BOUNDARY_MARKER_PATTERN, UNTRUSTED_MARKER_REPLACEMENT),
    MAX_UNTRUSTED_SAVED_URL_FIELD_LENGTH,
  )

const formatSavedUrlContextEntry = (
  record: AiSavedUrlRecord,
  index: number,
): string =>
  [
    `${index + 1}.`,
    sanitizeUntrustedSavedUrlText(record.title),
    '|',
    sanitizeUntrustedSavedUrlText(record.url),
    '|',
    `domain=${sanitizeUntrustedSavedUrlText(record.domain)}`,
  ].join(' ')

const buildSavedUrlContextSummary = (
  records: readonly AiSavedUrlRecord[],
  language: AppLanguage,
): string => {
  const recentSavedUrlPage = listSavedUrlPage([...records], {
    page: 1,
    pageSize: RECENT_SAVED_URL_CONTEXT_LIMIT,
    sortDirection: 'desc',
  })

  return [
    getMessage(language, 'background.aiChat.savedTabsCount', undefined, {
      count: String(recentSavedUrlPage.totalItems),
    }),
    getMessage(language, 'background.aiChat.recentTabs'),
    getMessage(language, 'background.aiChat.untrustedSavedUrlNotice'),
    UNTRUSTED_SAVED_URL_DATA_OPEN,
    ...recentSavedUrlPage.items.map(formatSavedUrlContextEntry),
    UNTRUSTED_SAVED_URL_DATA_CLOSE,
  ].join('\n')
}

export {
  buildSavedUrlContextSummary,
  MAX_UNTRUSTED_SAVED_URL_FIELD_LENGTH,
  RECENT_SAVED_URL_CONTEXT_LIMIT,
  sanitizeUntrustedSavedUrlText,
  UNTRUSTED_SAVED_URL_DATA_CLOSE,
  UNTRUSTED_SAVED_URL_DATA_OPEN,
}
