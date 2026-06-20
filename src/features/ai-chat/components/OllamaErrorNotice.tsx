import { Check, Copy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'
import type { OllamaErrorDetails } from '@/types/background'

type OllamaErrorPlatform = 'mac' | 'unknown' | 'win'
const COPIED_ICON_TIMEOUT = 2000

interface OllamaErrorNoticeProps {
  className?: string
  error: OllamaErrorDetails
  platform: OllamaErrorPlatform
}

const CopyableValueRow = ({
  buttonLabel,
  value,
}: {
  buttonLabel: string
  value: string
}) => {
  const { t } = useI18n()
  const [isCopied, setIsCopied] = useState(false)
  const copiedTimeoutRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current)
        copiedTimeoutRef.current = null
      }
    },
    [],
  )

  const copyToClipboard = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      toast.error(
        t('aiChat.ollama.copyError', undefined, {
          label: buttonLabel,
        }),
      )
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current)
      }
      setIsCopied(true)
      toast.success(
        t('aiChat.ollama.copySuccess', undefined, {
          label: buttonLabel,
        }),
      )
      copiedTimeoutRef.current = window.setTimeout(() => {
        setIsCopied(false)
        copiedTimeoutRef.current = null
      }, COPIED_ICON_TIMEOUT)
    } catch {
      toast.error(
        t('aiChat.ollama.copyError', undefined, {
          label: buttonLabel,
        }),
      )
    }
  }, [buttonLabel, t, value])

  const handleCopyClick = useCallback(() => {
    void copyToClipboard()
  }, [copyToClipboard])

  return (
    <div className='flex items-center gap-2'>
      <Input
        aria-label={`${buttonLabel} value`}
        className={cn(
          'min-w-0 flex-1',
          'px-3 py-2 font-mono text-xs leading-5',
        )}
        readOnly
        value={value}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={buttonLabel}
            className='size-8 shrink-0'
            data-state={isCopied ? 'copied' : 'idle'}
            onClick={handleCopyClick}
            size='icon-sm'
            title={
              isCopied ? t('aiChat.ollama.copied') : t('aiChat.ollama.copy')
            }
            type='button'
            variant='outline'
          >
            {isCopied ? <Check size={14} /> : <Copy size={14} />}
            <span className='sr-only'>{buttonLabel}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          <p>
            {isCopied ? t('aiChat.ollama.copied') : t('aiChat.ollama.copy')}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

const PlatformInstructions = ({
  configuredOrigin,
  platform,
  t,
}: {
  configuredOrigin: string
  platform: OllamaErrorPlatform
  t: (key: string, fallback?: string, values?: Record<string, string>) => string
}) => {
  if (platform === 'mac') {
    return (
      <>
        <p>{t('aiChat.ollama.mac.step1')}</p>
        <p>{t('aiChat.ollama.mac.step2')}</p>
        <CopyableValueRow
          buttonLabel={t('aiChat.ollama.copyCommand')}
          value={`launchctl setenv OLLAMA_ORIGINS "${configuredOrigin}"`}
        />
        <p>{t('aiChat.ollama.mac.step3')}</p>
        <p>{t('aiChat.ollama.mac.step4')}</p>
        <p>{t('aiChat.ollama.mac.step5')}</p>
      </>
    )
  }

  if (platform === 'win') {
    return (
      <>
        <p>{t('aiChat.ollama.win.step1')}</p>
        <p>{t('aiChat.ollama.win.step2')}</p>
        <p>{t('aiChat.ollama.win.step3')}</p>
        <p>{t('aiChat.ollama.win.step4')}</p>
        <p>{t('aiChat.ollama.win.step5')}</p>
        <p>{t('aiChat.ollama.win.step6')}</p>
        <CopyableValueRow
          buttonLabel={t('aiChat.ollama.copyValue')}
          value={configuredOrigin}
        />
        <p>{t('aiChat.ollama.win.step7')}</p>
      </>
    )
  }

  return (
    <>
      <p>{t('aiChat.ollama.unknown.step1')}</p>
      <p>{t('aiChat.ollama.unknown.step2')}</p>
      <CopyableValueRow
        buttonLabel={t('aiChat.ollama.copyValue')}
        value={configuredOrigin}
      />
    </>
  )
}

const OllamaErrorNotice = ({
  className,
  error,
  platform,
}: OllamaErrorNoticeProps) => {
  const { t } = useI18n()
  const isConnectionError = error.kind === 'notInstalledOrNotRunning'
  const configuredOrigin = error.allowedOrigins ?? 'chrome-extension://*'

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'max-h-40 space-y-2 overflow-x-hidden overflow-y-auto pr-1 wrap-break-word',
          '[&_a]:break-all',
          '[&_code]:break-all [&_code]:whitespace-pre-wrap',
          '[&_p]:wrap-break-word [&_p]:whitespace-pre-wrap',
          className,
        )}
      >
        <p>
          {isConnectionError
            ? t('aiChat.ollama.connectionError')
            : t('aiChat.ollama.forbiddenError')}
        </p>

        {isConnectionError ? (
          <>
            <p>{t('aiChat.ollama.notInstalledDownload')}</p>
            <p>{t('aiChat.ollama.notInstalledStart')}</p>
          </>
        ) : (
          <p>{t('aiChat.ollama.setOrigins')}</p>
        )}

        <PlatformInstructions
          configuredOrigin={configuredOrigin}
          platform={platform}
          t={t}
        />

        <p>
          {t('aiChat.ollama.connectionUrl')}{' '}
          <a
            className='break-all underline underline-offset-2'
            href={error.baseUrl}
            rel='noreferrer'
            target='_blank'
          >
            {error.baseUrl}
          </a>
        </p>
        <p>
          {t('aiChat.ollama.tagsUrl')}{' '}
          <a
            className='break-all underline underline-offset-2'
            href={error.tagsUrl}
            rel='noreferrer'
            target='_blank'
          >
            {error.tagsUrl}
          </a>
        </p>
        <p>{t('aiChat.ollama.checkCommand')}</p>
        <CopyableValueRow
          buttonLabel={t('aiChat.ollama.copyCheckCommand')}
          value={`curl ${error.tagsUrl}`}
        />

        {isConnectionError ? (
          <p>
            {t('aiChat.ollama.downloadUrl')}{' '}
            <a
              className='break-all underline underline-offset-2'
              href={error.downloadUrl}
              rel='noreferrer'
              target='_blank'
            >
              {error.downloadUrl}
            </a>
          </p>
        ) : null}

        <p>
          {t('aiChat.ollama.faq')}{' '}
          <a
            className='break-all underline underline-offset-2'
            href={error.faqUrl}
            rel='noreferrer'
            target='_blank'
          >
            {error.faqUrl}
          </a>
        </p>
      </div>
    </TooltipProvider>
  )
}

export type { OllamaErrorPlatform }
export { OllamaErrorNotice }
