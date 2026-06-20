import type { AiChatAttachment } from '@/features/ai-chat/types'

const ATTACHMENT_PREVIEW_LENGTH = 32

export const getSavedTabsChatAttachmentId = (attachment: AiChatAttachment) =>
  [
    attachment.filename,
    attachment.mediaType,
    attachment.kind,
    attachment.content.length,
    attachment.content.slice(0, ATTACHMENT_PREVIEW_LENGTH),
  ].join('-')
