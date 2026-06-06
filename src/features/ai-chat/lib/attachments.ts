import type { FileUIPart } from 'ai'

import type { AiChatAttachment } from '@/features/ai-chat/types'
import { getMessage } from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'

const TEXT_ATTACHMENT_MEDIA_TYPES = new Set([
  'application/javascript',
  'application/json',
  'application/xml',
  'text/javascript',
])

const IMAGE_ATTACHMENT_MEDIA_TYPE_PREFIX = 'image/'
const TEXT_ATTACHMENT_MEDIA_TYPE_PREFIX = 'text/'

const AI_CHAT_ATTACHMENT_FALLBACK_FILENAME = 'attachment'
const AI_CHAT_MAX_ATTACHMENTS = 5
const AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES = 2 * 1024 * 1024

const decodeBase64 = (value: string): Uint8Array => {
  const binaryValue =
    typeof atob === 'function'
      ? atob(value)
      : Buffer.from(value, 'base64').toString('binary')

  return Uint8Array.from(binaryValue, (char) => char.codePointAt(0))
}

const decodeTextWithCharset = (
  value: Uint8Array,
  charset: string | undefined,
): string => {
  try {
    return new TextDecoder(charset || 'utf8').decode(value)
  } catch {
    return new TextDecoder('utf-8').decode(value)
  }
}

const parseDataUrl = (
  dataUrl: string,
): {
  charset?: string
  mediaType: string
  payload: string
  usesBase64: boolean
} | null => {
  const matched =
    /^data:(?<mediaType>[^;,]+)?(?:;charset=(?<charset>[^;,]+))?(?<base64>;base64)?,(?<payload>[\s\S]*)$/u.exec(
      dataUrl,
    )

  if (!matched?.groups) {
    return null
  }

  return {
    charset: matched.groups.charset,
    mediaType: matched.groups.mediaType || 'text/plain',
    payload: matched.groups.payload,
    usesBase64: matched.groups.base64 === ';base64',
  }
}

const isTextAttachment = (mediaType: string): boolean =>
  mediaType.startsWith(TEXT_ATTACHMENT_MEDIA_TYPE_PREFIX) ||
  TEXT_ATTACHMENT_MEDIA_TYPES.has(mediaType)

const isImageAttachment = (mediaType: string): boolean =>
  mediaType.startsWith(IMAGE_ATTACHMENT_MEDIA_TYPE_PREFIX)

const getAttachmentKind = (
  mediaType: string,
): AiChatAttachment['kind'] | null => {
  if (isImageAttachment(mediaType)) {
    return 'image'
  }
  if (isTextAttachment(mediaType)) {
    return 'text'
  }

  return null
}

const decodeTextDataUrl = (
  dataUrl: string,
  language: AppLanguage = 'ja',
): string => {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) {
    throw new Error(getMessage(language, 'aiChat.attachments.readError'))
  }

  if (parsed.usesBase64) {
    return decodeTextWithCharset(decodeBase64(parsed.payload), parsed.charset)
  }

  return decodeURIComponent(parsed.payload)
}

const getAttachmentFilename = (file: Pick<FileUIPart, 'filename'>): string =>
  file.filename?.trim() || AI_CHAT_ATTACHMENT_FALLBACK_FILENAME

const getUnsupportedAttachmentError = (
  filename: string,
  mediaType: string,
  language: AppLanguage = 'ja',
) =>
  getMessage(language, 'aiChat.attachments.unsupportedTypeDetail', undefined, {
    filename,
    mediaType,
  })

const convertPromptInputFilesToAiChatAttachments = async (
  files: FileUIPart[],
  language: AppLanguage = 'ja',
): Promise<AiChatAttachment[]> =>
  files.map((file) => {
    const filename = getAttachmentFilename(file)
    const mediaType = file.mediaType || 'application/octet-stream'
    const kind = getAttachmentKind(mediaType)

    if (!kind) {
      throw new Error(
        getUnsupportedAttachmentError(filename, mediaType, language),
      )
    }

    return {
      content:
        kind === 'text' ? decodeTextDataUrl(file.url, language) : file.url,
      filename,
      kind,
      mediaType,
    }
  })

const buildTextAttachmentContext = (
  attachments: AiChatAttachment[],
  language: AppLanguage = 'ja',
): string => {
  const textAttachments = attachments.filter(
    (attachment) =>
      attachment.kind === 'text' && attachment.content.trim().length > 0,
  )

  if (textAttachments.length === 0) {
    return ''
  }

  return [
    getMessage(language, 'aiChat.attachments.contextTitle'),
    ...textAttachments.map((attachment, index) =>
      [
        `[${index + 1}] ${attachment.filename} (${attachment.mediaType})`,
        attachment.content,
      ].join('\n'),
    ),
  ].join('\n\n')
}

const getAiChatAttachmentInputAccept = (): string =>
  [
    'image/*',
    'text/*',
    'application/javascript',
    'application/json',
    'application/xml',
    'text/javascript',
  ].join(',')

export {
  AI_CHAT_MAX_ATTACHMENTS,
  AI_CHAT_MAX_ATTACHMENT_SIZE_BYTES,
  buildTextAttachmentContext,
  convertPromptInputFilesToAiChatAttachments,
  getAiChatAttachmentInputAccept,
}
