import { MessageCircleMore } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSavedTabsChatController } from '@/features/ai-chat/hooks/useSavedTabsChatController'
import type { SavedTabsChatControllerOptions } from '@/features/ai-chat/hooks/useSavedTabsChatController'

import { SavedTabsChatPanel } from './SavedTabsChatPanel'
import { SystemPromptManagerDialog } from './SystemPromptManagerDialog'

type SavedTabsChatWidgetProps = SavedTabsChatControllerOptions

const SavedTabsChatWidget = (props: SavedTabsChatWidgetProps = {}) => {
  const controller = useSavedTabsChatController(props)

  return (
    <>
      {controller.launcher.isVisible ? (
        <Button
          type='button'
          aria-label={controller.launcher.label}
          className='fixed right-4 bottom-4 z-50 size-10 cursor-pointer rounded-full shadow-lg'
          onClick={controller.launcher.handleOpen}
        >
          <MessageCircleMore className='size-5' />
        </Button>
      ) : null}

      <SavedTabsChatPanel
        activeSystemPromptId={controller.settings.activeSystemPromptId}
        chatErrorMessage={controller.errors.chatMessage}
        historyItems={controller.history.items}
        historyVariant={controller.history.variant}
        input={controller.messages.input}
        layout={controller.layout}
        messages={controller.messages.items}
        modelOptions={controller.settings.modelOptions}
        onClose={controller.actions.handleClose}
        onCopyConversation={controller.actions.handleCopyConversation}
        onFetchModels={controller.actions.handleFetchModels}
        onInputChange={controller.actions.handleInputChange}
        onOpenSystemPromptManager={
          controller.actions.handleOpenSystemPromptManager
        }
        onResetConversation={controller.actions.handleCreateConversation}
        onResizeStart={controller.actions.handleResizeStart}
        onSelectModel={controller.actions.handleSelectModel}
        onSelectSuggestion={controller.actions.handleSelectSuggestion}
        onSelectSystemPrompt={controller.actions.handleSelectSystemPrompt}
        onSubmit={controller.actions.handleSubmit}
        platform={controller.settings.platform}
        setupErrorMessage={controller.errors.setupMessage}
        status={controller.status}
        systemPrompts={controller.settings.systemPrompts}
        title={controller.title}
        {...(controller.errors.chatOllama !== undefined
          ? { chatOllamaError: controller.errors.chatOllama }
          : {})}
        {...(controller.settings.modelName !== undefined
          ? { modelName: controller.settings.modelName }
          : {})}
        {...(controller.history.handleDeleteItem !== undefined
          ? { onDeleteHistoryItem: controller.history.handleDeleteItem }
          : {})}
        {...(controller.history.handleSelectItem !== undefined
          ? { onSelectHistoryItem: controller.history.handleSelectItem }
          : {})}
        {...(controller.history.handleToggle !== undefined
          ? { onToggleHistory: controller.history.handleToggle }
          : {})}
        {...(controller.errors.setupOllama !== undefined
          ? { setupOllamaError: controller.errors.setupOllama }
          : {})}
      />
      <SystemPromptManagerDialog {...controller.dialog} />
    </>
  )
}

export { SavedTabsChatWidget }
