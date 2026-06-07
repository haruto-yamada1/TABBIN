'use client'

import { CheckIcon, CopyIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { createContext, use } from 'react'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { useI18nText } from '@/features/i18n/lib/useI18nText'
import { cn } from '@/lib/utils'

import { useCopyState } from './use-copy-state'

interface SnippetContextType {
  code: string
}

const SnippetContext = createContext<SnippetContextType>({
  code: '',
})

export type SnippetProps = ComponentProps<typeof InputGroup> & {
  code: string
}

export const Snippet = ({
  code,
  className,
  children,
  ...props
}: SnippetProps) => (
  // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
  <SnippetContext.Provider value={useMemo(() => ({ code }), [code])}>
    <InputGroup className={cn('font-mono', className)} {...props}>
      {children}
    </InputGroup>
  </SnippetContext.Provider>
)

export type SnippetAddonProps = ComponentProps<typeof InputGroupAddon>

export const SnippetAddon = (props: SnippetAddonProps) => (
  <InputGroupAddon {...props} />
)

export type SnippetTextProps = ComponentProps<typeof InputGroupText>

export const SnippetText = ({ className, ...props }: SnippetTextProps) => (
  <InputGroupText
    className={cn('pl-2 font-normal text-muted-foreground', className)}
    {...props}
  />
)

export type SnippetInputProps = Omit<
  ComponentProps<typeof InputGroupInput>,
  'readOnly' | 'value'
>

export const SnippetInput = ({ className, ...props }: SnippetInputProps) => {
  const { code } = use(SnippetContext)

  return (
    <InputGroupInput
      className={cn('text-foreground', className)}
      readOnly
      value={code}
      {...props}
    />
  )
}

export type SnippetCopyButtonProps = ComponentProps<typeof InputGroupButton> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const SnippetCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: SnippetCopyButtonProps) => {
  const t = useI18nText()
  const { code } = use(SnippetContext)
  const { copyText, isCopied } = useCopyState({ onCopy, onError, timeout })

  const Icon = isCopied ? CheckIcon : CopyIcon

  return (
    <InputGroupButton
      aria-label={t('common.copy')}
      className={className}
      // eslint-disable-next-line typescript/no-misused-promises
      onClick={() => copyText(code, { skipIfCopied: true })}
      size='icon-sm'
      title={t('common.copy')}
      {...props}
    >
      {children ?? <Icon className='size-3.5' size={14} />}
    </InputGroupButton>
  )
}
