import { Copy, Info } from 'lucide-react'
import { useCallback, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import { cn } from '@/lib/utils'

const selectUrlText = (event: React.FocusEvent<HTMLTextAreaElement>) => {
  event.currentTarget.select()
}

const SavedUrlDetailsContent = ({
  url,
  title,
}: {
  url: string
  title: string
}) => {
  const { t } = useI18n()
  const headingId = useId()
  const [copyState, setCopyState] = useState<
    'idle' | 'pending' | 'copied' | 'error'
  >('idle')
  const handleCopy = useCallback(async () => {
    setCopyState('pending')
    try {
      await navigator.clipboard.writeText(url)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }, [url])

  const handleCopyClick = useCallback(() => {
    void handleCopy()
  }, [handleCopy])

  return (
    <PopoverContent
      align='end'
      aria-labelledby={headingId}
      className='max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto'
    >
      <p id={headingId} className='font-medium'>
        {t('savedTabs.url.fullUrl')}
      </p>
      <p className='text-sm break-words'>{title}</p>
      <Textarea
        aria-label={t('savedTabs.url.fullUrl')}
        value={url}
        readOnly
        dir='ltr'
        rows={4}
        spellCheck={false}
        className='resize-none font-mono text-sm break-all'
        onFocus={selectUrlText}
      />
      <Button
        type='button'
        size='sm'
        onClick={handleCopyClick}
        disabled={copyState === 'pending'}
      >
        <Copy size={14} aria-hidden='true' />
        {t('savedTabs.url.copy')}
      </Button>
      <output className='block text-sm'>
        {copyState === 'copied' && t('savedTabs.url.copied')}
        {copyState === 'error' && t('savedTabs.url.copyError')}
      </output>
    </PopoverContent>
  )
}

export const SavedUrlDetailsPopover = ({
  url,
  title,
  className,
}: {
  url: string
  title: string
  className?: string
}) => {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const label = t('savedTabs.url.viewDetails', undefined, {
    name: title || url,
  })
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={cn(
            'size-8 shrink-0 cursor-pointer text-muted-foreground',
            className,
          )}
          aria-label={label}
          title={label}
        >
          <Info size={14} aria-hidden='true' />
        </Button>
      </PopoverTrigger>
      {isOpen && <SavedUrlDetailsContent url={url} title={title} />}
    </Popover>
  )
}
