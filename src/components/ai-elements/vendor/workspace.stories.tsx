// @covers components/ai-elements/conversation.tsx
// @covers components/ai-elements/vendor/queue.tsx
// @covers components/ai-elements/reasoning.tsx
// @covers components/ai-elements/vendor/sandbox.tsx
// @covers components/ai-elements/sources.tsx
// @covers components/ai-elements/suggestion.tsx
// @covers components/ai-elements/vendor/task.tsx
// @covers components/ai-elements/vendor/web-preview.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { CheckCircle2, Lightbulb, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'

import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../conversation'
import { Message, MessageContent, MessageResponse } from '../message'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../reasoning'
import { Source, Sources, SourcesContent, SourcesTrigger } from '../sources'
import { Suggestion, Suggestions } from '../suggestion'
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemAttachment,
  QueueItemContent,
  QueueItemDescription,
  QueueItemFile,
  QueueItemImage,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from './queue'
import {
  Sandbox,
  SandboxContent,
  SandboxHeader,
  SandboxTabContent,
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
} from './sandbox'
import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from './task'
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewConsole,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from './web-preview'

const previewMountedAt = new Date('2026-03-15T09:00:00Z')
const previewWarningAt = new Date('2026-03-15T09:00:02Z')

export default {
  title: 'AI Elements/Workspace',
} satisfies Meta

type Story = StoryObj

const Workspace = () => (
  <div className='grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]'>
    <section className='space-y-4 rounded-xl border bg-card p-4'>
      <div className='flex items-center justify-between gap-3'>
        <h3 className='text-base font-semibold'>Conversation</h3>
        <Suggestions>
          <Suggestion suggestion='Summarize pinned tabs' />
          <Suggestion suggestion='Find duplicate docs' />
          <Suggestion suggestion='Prepare weekly review' />
        </Suggestions>
      </div>

      <div className='h-[420px] overflow-hidden rounded-lg border'>
        <Conversation className='h-full'>
          <ConversationContent>
            <Message from='assistant'>
              <MessageContent>
                I grouped your saved tabs into 4 projects and found 2
                duplicates.
              </MessageContent>
            </Message>

            <Reasoning defaultOpen duration={4}>
              <ReasoningTrigger />
              <ReasoningContent>
                Checked pinned tabs first, then clustered pages by hostname and
                shared issue keys.
              </ReasoningContent>
            </Reasoning>

            <Message from='assistant'>
              <MessageResponse>
                {`### Suggested cleanup\n- Archive the duplicate Storybook docs tab\n- Keep the saved issue triage page pinned\n- Export the active project summary`}
              </MessageResponse>
            </Message>

            <Sources>
              <SourcesTrigger count={2} />
              <SourcesContent>
                <Source
                  href='https://storybook.js.org/docs'
                  title='Storybook docs'
                />
                <Source
                  href='https://react.dev/reference/react'
                  title='React reference'
                />
              </SourcesContent>
            </Sources>
          </ConversationContent>
          <ConversationDownload
            messages={[
              {
                content:
                  'I grouped your saved tabs into 4 projects and found 2 duplicates.',
                role: 'assistant',
              },
            ]}
          />
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className='rounded-lg border bg-muted/30 p-4'>
        <ConversationEmptyState
          description='Try one of the suggestion chips above to seed the next batch.'
          icon={<Lightbulb className='size-5' />}
          title='No active draft'
        />
      </div>
    </section>

    <section className='space-y-4 rounded-xl border bg-card p-4'>
      <h3 className='text-base font-semibold'>Side Surfaces</h3>

      <Task defaultOpen>
        <TaskTrigger title='Search and review saved tabs' />
        <TaskContent>
          <TaskItem>
            Search Storybook docs for interaction testing changes.
            <div className='mt-1 flex gap-2'>
              <TaskItemFile>
                components/ai-elements/workspace.stories.tsx
              </TaskItemFile>
              <TaskItemFile>
                lib/storybook/component-coverage.test.ts
              </TaskItemFile>
            </div>
          </TaskItem>
          <TaskItem>
            Prepare a concise cleanup summary for weekly review.
          </TaskItem>
        </TaskContent>
      </Task>

      <Queue>
        <QueueSection defaultOpen>
          <QueueSectionTrigger>
            <QueueSectionLabel
              count={2}
              icon={<Search className='size-4' />}
              label='queued tasks'
            />
          </QueueSectionTrigger>
          <QueueSectionContent>
            <QueueList>
              <QueueItem>
                <div className='flex items-start gap-3'>
                  <QueueItemIndicator />
                  <div className='min-w-0 flex-1'>
                    <QueueItemContent>
                      Review saved tabs for the Storybook rollout
                    </QueueItemContent>
                    <QueueItemDescription>
                      Compare project tabs and existing feature stories.
                    </QueueItemDescription>
                    <QueueItemAttachment>
                      <QueueItemImage
                        alt='preview'
                        src='data:image/gif;base64,R0lGODlhAQABAAAAACw='
                      />
                      <QueueItemFile>storyboard.png</QueueItemFile>
                    </QueueItemAttachment>
                  </div>
                  <QueueItemActions>
                    <QueueItemAction>
                      <CheckCircle2 className='size-4' />
                    </QueueItemAction>
                  </QueueItemActions>
                </div>
              </QueueItem>
            </QueueList>
          </QueueSectionContent>
        </QueueSection>
      </Queue>

      <Sandbox defaultOpen>
        <SandboxHeader state='output-available' title='Preview sandbox' />
        <SandboxContent>
          <SandboxTabs defaultValue='code'>
            <SandboxTabsBar>
              <SandboxTabsList>
                <SandboxTabsTrigger value='code'>Code</SandboxTabsTrigger>
                <SandboxTabsTrigger value='preview'>Preview</SandboxTabsTrigger>
              </SandboxTabsList>
            </SandboxTabsBar>
            <SandboxTabContent className='p-3' value='code'>
              <pre className='text-sm'>
                {`export const story = {\n  render: () => <Workspace />\n}`}
              </pre>
            </SandboxTabContent>
            <SandboxTabContent className='p-3 text-sm' value='preview'>
              Interactive preview panel for Storybook-ready flows.
            </SandboxTabContent>
          </SandboxTabs>
        </SandboxContent>
      </Sandbox>

      <WebPreview className='h-[320px]' defaultUrl='https://storybook.js.org'>
        <WebPreviewNavigation>
          <WebPreviewNavigationButton tooltip='Back'>
            <span aria-hidden='true'>&larr;</span>
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton tooltip='Forward'>
            <span aria-hidden='true'>&rarr;</span>
          </WebPreviewNavigationButton>
          <WebPreviewUrl />
          <Button size='sm' variant='outline'>
            Open
          </Button>
        </WebPreviewNavigation>
        <WebPreviewBody />
        <WebPreviewConsole
          logs={[
            {
              level: 'log',
              message: 'Preview mounted successfully.',
              timestamp: previewMountedAt,
            },
            {
              level: 'warn',
              message: 'Third-party cookies blocked in iframe sandbox.',
              timestamp: previewWarningAt,
            },
          ]}
        />
      </WebPreview>
    </section>
  </div>
)

export const WorkspacePanels: Story = {
  render: () => <Workspace />,
}
