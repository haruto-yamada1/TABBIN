import type { AiChatConversationMessage } from '@/features/ai-chat/types'

const EXCERPT_CONTEXT_LENGTH = 40
const MAX_EXCERPTS_PER_CONVERSATION = 3
const COMBINING_MARK_PATTERN = /[\u0300-\u036F\u3099\u309A\uFF9E\uFF9F]/u
const WHITESPACE_PATTERN = /\s/u

type AiChatHistorySearchSource = {
  id: string
  messages: AiChatConversationMessage[]
  title: string
  updatedAt: number
}

type AiChatHistorySearchSegment = {
  isMatch: boolean
  offset: number
  text: string
}

type AiChatHistorySearchExcerpt = {
  messageId: string
  role: AiChatConversationMessage['role']
  segments: AiChatHistorySearchSegment[]
}

type AiChatHistorySearchResult = {
  conversationId: string
  excerpts: AiChatHistorySearchExcerpt[]
  matchedMessageCount: number
  title: string
  titleMatch: boolean
  updatedAt: number
}

type NormalizedText = {
  ends: number[]
  starts: number[]
  text: string
}

const normalizeSearchText = (value: string): NormalizedText => {
  const rawCharacters: string[] = []
  const rawStarts: number[] = []
  const rawEnds: number[] = []
  let segment = ''
  let segmentStart = 0
  let offset = 0

  const flushSegment = () => {
    if (segment.length === 0) {
      return
    }

    const normalizedSegment = segment.normalize('NFKC').toLowerCase()
    for (const character of normalizedSegment) {
      rawCharacters.push(character)
      rawStarts.push(segmentStart)
      rawEnds.push(segmentStart + segment.length)
    }
    segment = ''
  }

  for (const character of value) {
    if (segment.length > 0 && COMBINING_MARK_PATTERN.test(character)) {
      segment += character
    } else {
      flushSegment()
      segment = character
      segmentStart = offset
    }
    offset += character.length
  }
  flushSegment()

  const characters: string[] = []
  const starts: number[] = []
  const ends: number[] = []
  let previousWasWhitespace = false

  const pushCodeUnits = (character: string, start: number, end: number) => {
    for (const unit of character.split('')) {
      characters.push(unit)
      starts.push(start)
      ends.push(end)
    }
  }

  for (let index = 0; index < rawCharacters.length; index += 1) {
    const character = rawCharacters[index] ?? ''

    if (WHITESPACE_PATTERN.test(character)) {
      if (previousWasWhitespace) {
        continue
      }
      pushCodeUnits(' ', rawStarts[index] ?? 0, rawEnds[index] ?? 0)
      previousWasWhitespace = true
    } else {
      pushCodeUnits(character, rawStarts[index] ?? 0, rawEnds[index] ?? 0)
      previousWasWhitespace = false
    }
  }

  return {
    ends,
    starts,
    text: characters.join(''),
  }
}

const normalizeSearchQuery = (query: string): string =>
  normalizeSearchText(query).text.trim()

const isConversationSearchActive = (query: string): boolean =>
  normalizeSearchQuery(query).length > 0

const createExcerpt = ({
  matchIndex,
  matchLength,
  message,
  normalizedContent,
}: {
  matchIndex: number
  matchLength: number
  message: AiChatConversationMessage
  normalizedContent: NormalizedText
}): AiChatHistorySearchExcerpt => {
  const matchStart = normalizedContent.starts[matchIndex] ?? 0
  const matchEnd = Math.max(
    matchStart + 1,
    normalizedContent.ends[matchIndex + matchLength - 1] ?? 0,
  )
  const excerptStart = Math.max(0, matchStart - EXCERPT_CONTEXT_LENGTH)
  const excerptEnd = Math.min(
    message.content.length,
    matchEnd + EXCERPT_CONTEXT_LENGTH,
  )
  const segments: AiChatHistorySearchSegment[] = []

  if (excerptStart > 0) {
    segments.push({ isMatch: false, offset: 0, text: '…' })
  }

  const before = message.content.slice(excerptStart, matchStart)
  if (before.length > 0) {
    segments.push({ isMatch: false, offset: excerptStart, text: before })
  }

  segments.push({
    isMatch: true,
    offset: matchStart,
    text: message.content.slice(matchStart, matchEnd),
  })

  const after = message.content.slice(matchEnd, excerptEnd)
  if (after.length > 0) {
    segments.push({ isMatch: false, offset: matchEnd, text: after })
  }

  if (excerptEnd < message.content.length) {
    segments.push({ isMatch: false, offset: excerptEnd, text: '…' })
  }

  return {
    messageId: message.id,
    role: message.role,
    segments,
  }
}

const searchConversations = (
  conversations: readonly AiChatHistorySearchSource[],
  query: string,
): AiChatHistorySearchResult[] => {
  const normalizedQuery = normalizeSearchQuery(query)
  if (normalizedQuery.length === 0) {
    return []
  }

  const results: AiChatHistorySearchResult[] = []

  for (const conversation of conversations) {
    const titleMatch = normalizeSearchText(conversation.title).text.includes(
      normalizedQuery,
    )
    const excerpts: AiChatHistorySearchExcerpt[] = []
    let matchedMessageCount = 0

    for (const message of conversation.messages) {
      const normalizedContent = normalizeSearchText(message.content)
      const matchIndex = normalizedContent.text.indexOf(normalizedQuery)

      if (matchIndex === -1) {
        continue
      }

      matchedMessageCount += 1
      if (excerpts.length < MAX_EXCERPTS_PER_CONVERSATION) {
        excerpts.push(
          createExcerpt({
            matchIndex,
            matchLength: normalizedQuery.length,
            message,
            normalizedContent,
          }),
        )
      }
    }

    if (!titleMatch && matchedMessageCount === 0) {
      continue
    }

    results.push({
      conversationId: conversation.id,
      excerpts,
      matchedMessageCount,
      title: conversation.title,
      titleMatch,
      updatedAt: conversation.updatedAt,
    })
  }

  return results.toSorted((left, right) => {
    if (left.titleMatch !== right.titleMatch) {
      return left.titleMatch ? -1 : 1
    }

    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt
    }

    return right.conversationId.localeCompare(left.conversationId)
  })
}

export { isConversationSearchActive, searchConversations }
export type {
  AiChatHistorySearchExcerpt,
  AiChatHistorySearchResult,
  AiChatHistorySearchSegment,
  AiChatHistorySearchSource,
}
