import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type ConversationPreviewTooltipProps = {
  id: string
  preview: string
}

export const ConversationPreviewTooltip = ({
  id,
  preview,
}: ConversationPreviewTooltipProps) => (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className='mt-1 line-clamp-3 w-full min-w-0 text-xs leading-5 wrap-anywhere text-muted-foreground'
          data-testid={`conversation-preview-${id}`}
        >
          {preview}
        </span>
      </TooltipTrigger>
      <TooltipContent
        align='start'
        className='max-w-sm p-0 text-left'
        side='right'
      >
        <div
          className='max-h-[min(24rem,calc(100vh-2rem))] overflow-y-auto px-3 py-1.5 text-xs leading-5 wrap-anywhere whitespace-pre-wrap'
          data-testid={`conversation-preview-tooltip-content-${id}`}
        >
          {preview}
        </div>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)
