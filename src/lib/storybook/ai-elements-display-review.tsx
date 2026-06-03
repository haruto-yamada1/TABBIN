import type { Tool as AiTool } from 'ai'
import { Copy, ExternalLink } from 'lucide-react'

import {
  Agent,
  AgentContent,
  AgentHeader,
  AgentInstructions,
  AgentOutput,
  AgentTool,
  AgentTools,
} from '@/components/ai-elements/agent'
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact'
import {
  Attachment,
  AttachmentEmpty,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments'
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from '@/components/ai-elements/checkpoint'
import { Persona } from '@/components/ai-elements/persona'
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan'
import {
  Snippet,
  SnippetAddon,
  SnippetCopyButton,
  SnippetInput,
  SnippetText,
} from '@/components/ai-elements/snippet'
import {
  Transcription,
  TranscriptionSegment,
} from '@/components/ai-elements/transcription'

const samplePng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+AP7m8kG6QAAAABJRU5ErkJggg=='

const sampleTool = {
  description: 'Cluster tabs by project and urgency',
  inputSchema: {
    properties: {
      includeArchived: { type: 'boolean' },
      projectId: { type: 'string' },
    },
    required: ['projectId'],
    type: 'object',
  },
} as unknown as AiTool

const sampleAttachment = {
  filename: 'review.png',
  id: 'file-1',
  mediaType: 'image/png',
  type: 'file',
  url: `data:image/png;base64,${samplePng}`,
} as const

const sampleSource = {
  filename: 'migration-guide.md',
  id: 'source-1',
  mediaType: 'text/markdown',
  title: 'Migration guide',
  type: 'source-document',
  url: 'https://tabbin.app/docs/migration',
} as const

const Section = ({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) => (
  <section className='gap-y-3 rounded-xl border bg-card p-4'>
    <h3 className='text-base font-semibold'>{title}</h3>
    {children}
  </section>
)

const ReviewArtifacts = () => (
  <div className='grid gap-6 xl:grid-cols-2'>
    <Section title='Agent + Plan'>
      <Agent>
        <AgentHeader model='gpt-4.1-mini' name='Workspace planner' />
        <AgentContent>
          <AgentInstructions>
            Review pinned tabs, identify duplicates, and suggest the next
            cleanup batch.
          </AgentInstructions>
          <AgentTools collapsible type='single'>
            <AgentTool tool={sampleTool} value='cluster-tabs' />
          </AgentTools>
          <AgentOutput
            schema={`type Plan = {\n  projectId: string\n  summary: string\n  actions: string[]\n}`}
          />
        </AgentContent>
      </Agent>

      <Plan defaultOpen isStreaming>
        <PlanHeader>
          <div className='gap-y-1'>
            <PlanTitle>Rebuild weekly review buckets</PlanTitle>
            <PlanDescription>
              Group tabs into workstreams, then generate a handoff summary.
            </PlanDescription>
          </div>
          <PlanAction>
            <PlanTrigger />
          </PlanAction>
        </PlanHeader>
        <PlanContent className='gap-y-2 text-sm'>
          <p>1. Detect duplicate references and landing pages.</p>
          <p>2. Keep pinned research, archive stale implementation tabs.</p>
          <p>3. Prepare one cleanup action per project.</p>
        </PlanContent>
        <PlanFooter className='text-xs text-muted-foreground'>
          Streaming reasoning enabled
        </PlanFooter>
      </Plan>
    </Section>

    <Section title='Artifact + Checkpoint'>
      <Artifact>
        <ArtifactHeader>
          <div>
            <ArtifactTitle>Weekly review export</ArtifactTitle>
            <ArtifactDescription>
              Snapshot generated from saved tabs and AI notes.
            </ArtifactDescription>
          </div>
          <ArtifactActions>
            <ArtifactAction icon={Copy} label='Copy' tooltip='Copy summary' />
            <ArtifactAction
              icon={ExternalLink}
              label='Open'
              tooltip='Open exported report'
            />
            <ArtifactClose />
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent className='gap-y-3 text-sm'>
          <p>12 tabs were grouped into 4 active projects.</p>
          <p className='text-muted-foreground'>
            Two duplicates were archived and one stale issue page was closed.
          </p>
        </ArtifactContent>
      </Artifact>

      <Checkpoint>
        <CheckpointTrigger tooltip='Pinned to project review'>
          <CheckpointIcon />
          Review checkpoint
        </CheckpointTrigger>
      </Checkpoint>
    </Section>

    <Section title='Attachments + Snippet'>
      <div className='gap-y-4'>
        <Attachments variant='grid'>
          <Attachment data={sampleAttachment} onRemove={() => undefined}>
            <AttachmentHoverCard>
              <AttachmentHoverCardTrigger asChild>
                <div>
                  <AttachmentPreview />
                </div>
              </AttachmentHoverCardTrigger>
              <AttachmentHoverCardContent>
                <img
                  alt='review preview'
                  className='h-32 w-48 rounded object-cover'
                  src={`data:image/png;base64,${samplePng}`}
                />
              </AttachmentHoverCardContent>
            </AttachmentHoverCard>
            <AttachmentRemove />
          </Attachment>
        </Attachments>

        <Attachments variant='list'>
          <Attachment data={sampleSource as never}>
            <AttachmentPreview />
            <AttachmentInfo showMediaType />
          </Attachment>
        </Attachments>

        <AttachmentEmpty />

        <Snippet className='max-w-xl' code='bun run build-storybook'>
          <SnippetAddon>
            <SnippetText>$</SnippetText>
          </SnippetAddon>
          <SnippetInput />
          <SnippetCopyButton />
        </Snippet>
      </div>
    </Section>

    <Section title='Transcription + Persona'>
      <div className='gap-y-4'>
        <Transcription
          className='rounded-lg border p-3'
          currentTime={4}
          onSeek={() => undefined}
          segments={
            [
              { endSecond: 2, startSecond: 0, text: 'Pinned tabs grouped.' },
              { endSecond: 5, startSecond: 2, text: 'Cleanup draft prepared.' },
              {
                endSecond: 8,
                startSecond: 5,
                text: 'Export ready for review.',
              },
            ] as never
          }
        >
          {(segment, index) => (
            <TranscriptionSegment index={index} segment={segment} />
          )}
        </Transcription>

        <div className='flex items-center gap-4'>
          <Persona className='size-20' state='thinking' variant='opal' />
          <div className='text-sm'>
            <p className='font-medium'>Persona preview</p>
            <p className='text-muted-foreground'>
              Voice/avatar state mapped to AI chat activity.
            </p>
          </div>
        </div>
      </div>
    </Section>
  </div>
)

export default ReviewArtifacts
