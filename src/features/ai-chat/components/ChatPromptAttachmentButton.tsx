import { Paperclip } from 'lucide-react'
import { useCallback } from 'react'

import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/features/i18n/context/I18nProvider'

const ChatPromptAttachmentButton = () => {
  const { t } = useI18n()
  const attachments = usePromptInputAttachments()
  const handleClick = useCallback(() => {
    attachments.openFileDialog()
  }, [attachments])

  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      aria-label={t('aiChat.attachments.add')}
      className='shrink-0'
      onClick={handleClick}
    >
      <Paperclip className='size-4' />
    </Button>
  )
}

export { ChatPromptAttachmentButton }
