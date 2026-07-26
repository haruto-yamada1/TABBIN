import { useMemo } from 'react'

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
} from '@/components/ai-elements/attachments'
import type { AiChatAttachment } from '@/features/ai-chat/types'

import { getSavedTabsChatAttachmentId } from './savedTabsChatAttachmentItem.helpers'

export const SavedTabsChatAttachmentItem = ({
  attachment,
}: {
  attachment: AiChatAttachment
}) => {
  const data = useMemo(
    () => ({
      filename: attachment.filename,
      id: getSavedTabsChatAttachmentId(attachment),
      mediaType: attachment.mediaType,
      type: 'file' as const,
      url: attachment.kind === 'image' ? attachment.content : '',
    }),
    [attachment],
  )

  return (
    <Attachment data={data}>
      <AttachmentPreview />
      <AttachmentInfo />
    </Attachment>
  )
}
