import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments'
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'
import { useI18n } from '@/features/i18n/context/I18nProvider'

const ChatPromptAttachments = () => {
  const { t } = useI18n()
  const attachments = usePromptInputAttachments()

  if (attachments.files.length === 0) {
    return null
  }

  return (
    <Attachments className='w-full px-3 pb-1' variant='inline'>
      {attachments.files.map((file) => (
        <Attachment
          data={file}
          key={file.id}
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onRemove={() => {
            attachments.remove(file.id)
          }}
        >
          <AttachmentPreview />
          <AttachmentInfo />
          <AttachmentRemove
            label={t('aiChat.attachments.deleteAria', undefined, {
              filename: file.filename ?? t('aiChat.attachments.defaultName'),
            })}
          />
        </Attachment>
      ))}
    </Attachments>
  )
}

export { ChatPromptAttachments }
