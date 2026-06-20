import type { FileUIPart } from 'ai'
import { useCallback } from 'react'

import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments'
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'
import type { AttachmentsContext } from '@/components/ai-elements/prompt-input'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'

const AttachmentItem = ({
  file,
  attachments,
  t,
}: {
  file: FileUIPart & { id: string }
  attachments: Pick<AttachmentsContext, 'remove'>
  t: TranslateFn
}) => {
  const handleRemove = useCallback(() => {
    attachments.remove(file.id)
  }, [attachments, file.id])

  return (
    <Attachment data={file} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentInfo />
      <AttachmentRemove
        label={t('aiChat.attachments.deleteAria', undefined, {
          filename: file.filename ?? t('aiChat.attachments.defaultName'),
        })}
      />
    </Attachment>
  )
}

const ChatPromptAttachments = () => {
  const { t } = useI18n()
  const attachments = usePromptInputAttachments()

  if (attachments.files.length === 0) {
    return null
  }

  return (
    <Attachments className='w-full px-3 pb-1' variant='inline'>
      {attachments.files.map((file) => (
        <AttachmentItem
          key={file.id}
          file={file}
          attachments={attachments}
          t={t}
        />
      ))}
    </Attachments>
  )
}

export { ChatPromptAttachments }
