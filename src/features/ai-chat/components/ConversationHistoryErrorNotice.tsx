import { Alert, AlertDescription } from '@/components/ui/alert'
import type { ConversationHistoryError } from '@/features/ai-chat/hooks/useSharedAiChatHistory'
import { useI18n } from '@/features/i18n/context/I18nProvider'

const ConversationHistoryErrorNotice = ({
  className,
  error,
}: {
  readonly className?: string
  readonly error: ConversationHistoryError | null
}) => {
  const { t } = useI18n()

  if (!error) {
    return null
  }

  return (
    <Alert className={className} variant='destructive'>
      <AlertDescription>
        {t(
          error === 'load'
            ? 'aiChat.historyLoadError'
            : 'aiChat.historySaveError',
        )}
      </AlertDescription>
    </Alert>
  )
}

export { ConversationHistoryErrorNotice }
