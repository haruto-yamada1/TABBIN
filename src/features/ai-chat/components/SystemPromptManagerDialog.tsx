import { Copy, Plus, Trash2 } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getAiChatToolDefinitions } from '@/constants/aiChatTools'
import {
  MAX_AI_SYSTEM_PROMPT_NAME_LENGTH,
  MAX_AI_SYSTEM_PROMPT_PRESETS,
} from '@/features/ai-chat/lib/systemPromptPresets'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import type { AppLanguage } from '@/features/i18n/messages'
import { cn } from '@/lib/utils'
import type { AiSystemPromptPreset } from '@/types/storage'

import { getSelectedPrompt } from './savedTabsChat/prompts'

export interface SystemPromptManagerDialogProps {
  activePromptId: string
  errorMessage: string
  isOpen: boolean
  isSaveDisabled: boolean
  isSaving: boolean
  presets: AiSystemPromptPreset[]
  selectedPromptId: string
  onCancel: () => void
  onChangePromptName: (value: string) => void
  onChangePromptTemplate: (value: string) => void
  onCloseChange: (isOpen: boolean) => void
  onCreatePrompt: () => void
  onDeletePrompt: () => void
  onDuplicatePrompt: () => void
  onSave: () => Promise<void>
  onSelectPrompt: (promptId: string) => void
}

const PresetButton = ({
  activePromptId,
  prompt,
  onSelectPrompt,
  selectedPromptId,
  t,
}: {
  activePromptId: string
  prompt: AiSystemPromptPreset
  onSelectPrompt: (promptId: string) => void
  selectedPromptId: string
  t: (key: string) => string
}) => {
  const handleClick = useCallback(() => {
    onSelectPrompt(prompt.id)
  }, [onSelectPrompt, prompt.id])
  return (
    <Button
      className={cn(
        'cursor-pointer overflow-hidden rounded-md border p-3 text-left transition-colors',
        prompt.id === selectedPromptId
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-border/80 hover:bg-muted/30',
      )}
      onClick={handleClick}
      type='button'
      variant='ghost'
    >
      <div className='flex min-w-0 items-center justify-between gap-2'>
        <p className='min-w-0 flex-1 truncate text-sm font-medium'>
          {prompt.name}
        </p>
        {prompt.id === activePromptId ? (
          <span className='shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground'>
            {t('aiChat.systemPrompt.inUse')}
          </span>
        ) : null}
      </div>
    </Button>
  )
}

const PromptEditorPanel = ({
  errorMessage,
  isDeleteDisabled,
  isLimitReached,
  language,
  onChangePromptName,
  onChangePromptTemplate,
  onDeletePrompt,
  onDuplicatePrompt,
  selectedPrompt,
  t,
}: {
  errorMessage: string
  isDeleteDisabled: boolean
  isLimitReached: boolean
  language: AppLanguage
  onChangePromptName: (value: string) => void
  onChangePromptTemplate: (value: string) => void
  onDeletePrompt: () => void
  onDuplicatePrompt: () => void
  selectedPrompt: AiSystemPromptPreset
  t: (key: string) => string
}) => {
  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangePromptName(event.target.value)
    },
    [onChangePromptName],
  )

  const handleTemplateChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChangePromptTemplate(event.target.value)
    },
    [onChangePromptTemplate],
  )

  return (
    <div className='gap-y-5'>
      <div className='gap-y-2'>
        <Label htmlFor='system-prompt-name'>
          {t('aiChat.systemPrompt.nameLabel')}
        </Label>
        <div
          className='flex items-start gap-2'
          data-testid='system-prompt-name-row'
        >
          <Input
            id='system-prompt-name'
            aria-label={t('aiChat.systemPrompt.nameLabel')}
            className='flex-1'
            maxLength={MAX_AI_SYSTEM_PROMPT_NAME_LENGTH}
            value={selectedPrompt.name}
            onChange={handleNameChange}
          />
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={isLimitReached}
            onClick={onDuplicatePrompt}
          >
            <Copy className='size-4' />
            {t('aiChat.systemPrompt.duplicate')}
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            disabled={isDeleteDisabled}
            onClick={onDeletePrompt}
          >
            <Trash2 className='size-4' />
            {t('common.delete')}
          </Button>
        </div>
      </div>

      <div className='gap-y-2'>
        <Label htmlFor='system-prompt-template'>
          {t('aiChat.systemPrompt.bodyLabel')}
        </Label>
        <Textarea
          id='system-prompt-template'
          aria-label={t('aiChat.systemPrompt.bodyLabel')}
          className='min-h-[420px] resize-y'
          value={selectedPrompt.template}
          onChange={handleTemplateChange}
        />
      </div>

      <div className='gap-y-3'>
        <div className='gap-y-1'>
          <p className='text-sm font-medium'>
            {t('aiChat.systemPrompt.availableTools')}
          </p>
          <p className='text-xs text-muted-foreground'>
            {t('aiChat.systemPrompt.availableToolsDescription')}
          </p>
        </div>
        <div className='grid gap-2 xl:grid-cols-2'>
          {getAiChatToolDefinitions(language).map((toolDefinition) => (
            <div
              className='rounded-md border border-border/70 bg-muted/20 p-3'
              key={toolDefinition.name}
            >
              <p className='font-mono text-xs'>{toolDefinition.name}</p>
              <p className='mt-2 text-sm text-muted-foreground'>
                {toolDefinition.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <p className='text-sm whitespace-pre-line text-destructive'>
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}

const PresetSidebar = ({
  activePromptId,
  isLimitReached,
  presets,
  selectedPromptId,
  onCreatePrompt,
  onSelectPrompt,
  t,
}: {
  activePromptId: string
  isLimitReached: boolean
  presets: AiSystemPromptPreset[]
  selectedPromptId: string
  onCreatePrompt: () => void
  onSelectPrompt: (promptId: string) => void
  t: (key: string) => string
}) => (
  <div className='flex min-h-0 flex-col border-r border-border'>
    <div className='border-b border-border p-4'>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <p className='text-sm font-medium'>
          {t('aiChat.systemPrompt.listTitle')}
        </p>
        <span className='text-xs text-muted-foreground'>
          {presets.length} / {MAX_AI_SYSTEM_PROMPT_PRESETS}
        </span>
      </div>
      <div className='grid gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={isLimitReached}
          onClick={onCreatePrompt}
        >
          <Plus className='size-4' />
          {t('aiChat.systemPrompt.new')}
        </Button>
      </div>
    </div>
    <div className='min-h-0 flex-1 overflow-y-auto p-3'>
      <div className='grid gap-2'>
        {presets.map((prompt) => (
          <PresetButton
            activePromptId={activePromptId}
            key={prompt.id}
            onSelectPrompt={onSelectPrompt}
            prompt={prompt}
            selectedPromptId={selectedPromptId}
            t={t}
          />
        ))}
      </div>
    </div>
  </div>
)

export const SystemPromptManagerDialog = ({
  activePromptId,
  errorMessage,
  isOpen,
  isSaveDisabled,
  isSaving,
  presets,
  selectedPromptId,
  onCancel,
  onChangePromptName,
  onChangePromptTemplate,
  onCloseChange,
  onCreatePrompt,
  onDeletePrompt,
  onDuplicatePrompt,
  onSave,
  onSelectPrompt,
}: SystemPromptManagerDialogProps) => {
  const { language, t } = useI18n()
  const selectedPrompt = getSelectedPrompt(presets, selectedPromptId)
  const isLimitReached = presets.length >= MAX_AI_SYSTEM_PROMPT_PRESETS
  const isDeleteDisabled = presets.length <= 1
  const handleSaveClick = useCallback(() => void onSave(), [onSave])

  return (
    <Dialog open={isOpen} onOpenChange={onCloseChange}>
      <DialogContent
        aria-describedby={undefined}
        className='flex h-[calc(100vh-48px)] max-h-none w-[calc(100vw-48px)] max-w-none flex-col gap-0 overflow-hidden p-0'
      >
        <DialogHeader className='border-b border-border px-6 py-4 text-left'>
          <DialogTitle>{t('aiChat.systemPrompt.managerTitle')}</DialogTitle>
        </DialogHeader>

        <div className='grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden'>
          <PresetSidebar
            activePromptId={activePromptId}
            isLimitReached={isLimitReached}
            onCreatePrompt={onCreatePrompt}
            onSelectPrompt={onSelectPrompt}
            presets={presets}
            selectedPromptId={selectedPromptId}
            t={t}
          />

          <div className='flex min-h-0 flex-col'>
            <div className='min-h-0 flex-1 overflow-y-auto px-6 py-5'>
              {selectedPrompt ? (
                <PromptEditorPanel
                  errorMessage={errorMessage}
                  isDeleteDisabled={isDeleteDisabled}
                  isLimitReached={isLimitReached}
                  language={language}
                  onChangePromptName={onChangePromptName}
                  onChangePromptTemplate={onChangePromptTemplate}
                  onDeletePrompt={onDeletePrompt}
                  onDuplicatePrompt={onDuplicatePrompt}
                  selectedPrompt={selectedPrompt}
                  t={t}
                />
              ) : null}
            </div>

            <DialogFooter className='border-t border-border px-6 py-4'>
              <Button
                type='button'
                variant='outline'
                disabled={isSaving}
                onClick={onCancel}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type='button'
                disabled={isSaveDisabled}
                onClick={handleSaveClick}
              >
                {isSaving
                  ? t('aiChat.systemPrompt.saving')
                  : t('aiChat.systemPrompt.save')}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
