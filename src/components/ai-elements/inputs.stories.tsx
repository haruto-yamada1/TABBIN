// @covers components/ai-elements/mic-selector.tsx
// @covers components/ai-elements/model-selector.tsx
// @covers components/ai-elements/open-in-chat.tsx
// @covers components/ai-elements/prompt-input.tsx
// @covers components/ai-elements/speech-input.tsx
// @covers components/ai-elements/voice-selector.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ImageIcon, MicIcon, PlusIcon, SparklesIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import {
  MicSelector,
  MicSelectorContent,
  MicSelectorEmpty,
  MicSelectorInput,
  MicSelectorItem,
  MicSelectorLabel,
  MicSelectorList,
  MicSelectorTrigger,
  MicSelectorValue,
} from './mic-selector'
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorSeparator,
  ModelSelectorShortcut,
  ModelSelectorTrigger,
} from './model-selector'
import {
  OpenIn,
  OpenInChatGPT,
  OpenInClaude,
  OpenInContent,
  OpenInCursor,
  OpenInItem,
  OpenInLabel,
  OpenInScira,
  OpenInSeparator,
  OpenInT3,
  OpenInTrigger,
  OpenInv0,
} from './open-in-chat'
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandInput,
  PromptInputCommandItem,
  PromptInputCommandList,
  PromptInputCommandSeparator,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputHoverCard,
  PromptInputHoverCardContent,
  PromptInputHoverCardTrigger,
  PromptInputProvider,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTab,
  PromptInputTabBody,
  PromptInputTabItem,
  PromptInputTabLabel,
  PromptInputTabsList,
  PromptInputTextarea,
  PromptInputTools,
} from './prompt-input'
import { SpeechInput } from './speech-input'
import {
  VoiceSelector,
  VoiceSelectorAccent,
  VoiceSelectorAge,
  VoiceSelectorAttributes,
  VoiceSelectorBullet,
  VoiceSelectorContent,
  VoiceSelectorDescription,
  VoiceSelectorEmpty,
  VoiceSelectorGender,
  VoiceSelectorGroup,
  VoiceSelectorInput,
  VoiceSelectorItem,
  VoiceSelectorList,
  VoiceSelectorName,
  VoiceSelectorPreview,
  VoiceSelectorSeparator,
  VoiceSelectorShortcut,
  VoiceSelectorTrigger,
} from './voice-selector'

export default {
  parameters: {
    layout: 'padded',
  },
  title: 'AI Elements/Inputs',
} satisfies Meta

type Story = StoryObj

const Section = ({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) => (
  <section className='space-y-3 rounded-xl border bg-card p-4'>
    <h3 className='text-base font-semibold'>{title}</h3>
    {children}
  </section>
)

const SelectorGallery = () => {
  const [micValue, setMicValue] = useState<string>()
  const [voiceValue, setVoiceValue] = useState<string | undefined>('alloy')

  return (
    <div className='grid gap-6 lg:grid-cols-2'>
      <Section title='Microphone'>
        <MicSelector
          defaultOpen
          onValueChange={setMicValue}
          open
          value={micValue}
        >
          <MicSelectorTrigger className='w-full justify-between'>
            <MicIcon className='size-4' />
            <MicSelectorValue />
          </MicSelectorTrigger>
          <MicSelectorContent>
            <MicSelectorInput />
            <MicSelectorList>
              {(devices) =>
                devices.length === 0 ? (
                  <MicSelectorEmpty />
                ) : (
                  devices.map((device) => (
                    <MicSelectorItem
                      key={device.deviceId}
                      value={device.deviceId}
                    >
                      <MicSelectorLabel device={device} />
                    </MicSelectorItem>
                  ))
                )
              }
            </MicSelectorList>
          </MicSelectorContent>
        </MicSelector>
      </Section>

      <Section title='Model Selector'>
        <ModelSelector defaultOpen open>
          <ModelSelectorTrigger asChild>
            <Button variant='outline'>Choose a model</Button>
          </ModelSelectorTrigger>
          <ModelSelectorContent>
            <ModelSelectorInput placeholder='Search models...' />
            <ModelSelectorList>
              <ModelSelectorEmpty>No model found.</ModelSelectorEmpty>
              <ModelSelectorGroup heading='Recommended'>
                <ModelSelectorItem value='openai/gpt-4.1-mini'>
                  <ModelSelectorLogoGroup>
                    <ModelSelectorLogo provider='openai' />
                    <ModelSelectorLogo provider='vercel' />
                  </ModelSelectorLogoGroup>
                  <ModelSelectorName>GPT-4.1 mini</ModelSelectorName>
                  <ModelSelectorShortcut>Fast</ModelSelectorShortcut>
                </ModelSelectorItem>
                <ModelSelectorItem value='anthropic/claude-3.7-sonnet'>
                  <ModelSelectorLogo provider='anthropic' />
                  <ModelSelectorName>Claude 3.7 Sonnet</ModelSelectorName>
                  <ModelSelectorShortcut>Reasoning</ModelSelectorShortcut>
                </ModelSelectorItem>
              </ModelSelectorGroup>
              <ModelSelectorSeparator />
              <ModelSelectorGroup heading='Fallback'>
                <ModelSelectorItem value='openrouter/deepseek-r1'>
                  <ModelSelectorLogo provider='openrouter' />
                  <ModelSelectorName>DeepSeek R1</ModelSelectorName>
                </ModelSelectorItem>
              </ModelSelectorGroup>
            </ModelSelectorList>
          </ModelSelectorContent>
        </ModelSelector>
      </Section>

      <Section title='Voice Selector'>
        <VoiceSelector
          defaultOpen
          onValueChange={setVoiceValue}
          open
          value={voiceValue}
        >
          <VoiceSelectorTrigger asChild>
            <Button variant='outline'>Voice preview</Button>
          </VoiceSelectorTrigger>
          <VoiceSelectorContent>
            <VoiceSelectorInput placeholder='Search voices...' />
            <VoiceSelectorList>
              <VoiceSelectorEmpty>No voice available.</VoiceSelectorEmpty>
              <VoiceSelectorGroup heading='OpenAI voices'>
                <VoiceSelectorItem value='alloy'>
                  <VoiceSelectorPreview />
                  <VoiceSelectorName>Alloy</VoiceSelectorName>
                  <VoiceSelectorAttributes>
                    <VoiceSelectorAccent value='american' />
                    <VoiceSelectorBullet />
                    <VoiceSelectorGender value='non-binary' />
                    <VoiceSelectorBullet />
                    <VoiceSelectorAge>Adult</VoiceSelectorAge>
                  </VoiceSelectorAttributes>
                  <VoiceSelectorDescription>
                    Balanced and neutral
                  </VoiceSelectorDescription>
                  <VoiceSelectorShortcut>Default</VoiceSelectorShortcut>
                </VoiceSelectorItem>
                <VoiceSelectorItem value='verse'>
                  <VoiceSelectorPreview playing />
                  <VoiceSelectorName>Verse</VoiceSelectorName>
                  <VoiceSelectorAttributes>
                    <VoiceSelectorAccent value='british' />
                    <VoiceSelectorBullet />
                    <VoiceSelectorGender value='female' />
                  </VoiceSelectorAttributes>
                  <VoiceSelectorDescription>
                    More expressive
                  </VoiceSelectorDescription>
                </VoiceSelectorItem>
              </VoiceSelectorGroup>
              <VoiceSelectorSeparator />
            </VoiceSelectorList>
          </VoiceSelectorContent>
        </VoiceSelector>
      </Section>

      <Section title='Open In Chat'>
        <OpenIn
          open
          query='Summarize my pinned TABBIN projects for weekly review'
        >
          <OpenInTrigger />
          <OpenInContent>
            <OpenInLabel>Providers</OpenInLabel>
            <OpenInChatGPT />
            <OpenInClaude />
            <OpenInT3 />
            <OpenInScira />
            <OpenInv0 />
            <OpenInCursor />
            <OpenInSeparator />
            <OpenInItem asChild>
              <a href='https://github.com' rel='noreferrer' target='_blank'>
                GitHub
              </a>
            </OpenInItem>
          </OpenInContent>
        </OpenIn>
      </Section>
    </div>
  )
}

const ComposerPlayground = () => {
  const [result, setResult] = useState('No submission yet.')
  const [status, setStatus] = useState<'ready' | 'submitted'>('ready')

  return (
    <PromptInputProvider initialInput='Group tabs by project and urgency.'>
      <div className='space-y-6'>
        <PromptInput
          className='rounded-xl border bg-card p-2'
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onSubmit={({ text, files }) => {
            setStatus('submitted')
            setResult(`${text} (${files.length} files)`)
          }}
        >
          <PromptInputHeader>
            <PromptInputHoverCard>
              <PromptInputHoverCardTrigger asChild>
                <PromptInputButton tooltip='Current preset'>
                  <SparklesIcon className='size-4' />
                  Triage
                </PromptInputButton>
              </PromptInputHoverCardTrigger>
              <PromptInputHoverCardContent>
                Use this preset to group tabs, detect duplicates, and propose a
                cleanup batch.
              </PromptInputHoverCardContent>
            </PromptInputHoverCard>

            <PromptInputSelect defaultValue='workspace'>
              <PromptInputSelectTrigger className='w-fit min-w-36'>
                <PromptInputSelectValue placeholder='Context' />
              </PromptInputSelectTrigger>
              <PromptInputSelectContent>
                <PromptInputSelectItem value='workspace'>
                  Current workspace
                </PromptInputSelectItem>
                <PromptInputSelectItem value='all-tabs'>
                  All saved tabs
                </PromptInputSelectItem>
              </PromptInputSelectContent>
            </PromptInputSelect>
          </PromptInputHeader>

          <PromptInputBody>
            <PromptInputTextarea />
          </PromptInputBody>

          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger tooltip='Actions'>
                  <PlusIcon className='size-4' />
                </PromptInputActionMenuTrigger>
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                  <PromptInputActionMenuItem>
                    Attach current selection
                  </PromptInputActionMenuItem>
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              <SpeechInput
// eslint-disable-next-line typescript/require-await
                onAudioRecorded={async () => 'Recorded from fallback audio'}
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                onTranscriptionChange={(text) => {
                  setResult(`Transcribed: ${text}`)
                }}
                variant='outline'
              />
            </PromptInputTools>

            <PromptInputSubmit
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onStop={() => {
                setStatus('ready')
              }}
              status={status === 'submitted' ? 'streaming' : 'ready'}
            />
          </PromptInputFooter>
        </PromptInput>

        <Section title='Command Palette Helpers'>
          <PromptInputTabsList className='grid gap-3 md:grid-cols-2'>
            <PromptInputTab className='rounded-lg border p-3'>
              <PromptInputTabLabel>Presets</PromptInputTabLabel>
              <PromptInputTabBody>
                <PromptInputTabItem>Weekly review</PromptInputTabItem>
                <PromptInputTabItem>Research cleanup</PromptInputTabItem>
              </PromptInputTabBody>
            </PromptInputTab>

            <PromptInputCommand className='rounded-lg border'>
              <PromptInputCommandInput placeholder='Search actions...' />
              <PromptInputCommandList>
                <PromptInputCommandEmpty>
                  No action found.
                </PromptInputCommandEmpty>
                <PromptInputCommandGroup heading='Quick actions'>
                  <PromptInputCommandItem>
                    Pin top 5 tabs
                  </PromptInputCommandItem>
                  <PromptInputCommandItem>
                    Archive duplicates
                  </PromptInputCommandItem>
                </PromptInputCommandGroup>
                <PromptInputCommandSeparator />
                <PromptInputCommandGroup heading='Attachments'>
                  <PromptInputCommandItem>
                    <ImageIcon className='mr-2 size-4' />
                    Add screenshot
                  </PromptInputCommandItem>
                </PromptInputCommandGroup>
              </PromptInputCommandList>
            </PromptInputCommand>
          </PromptInputTabsList>
        </Section>

        <p className='text-sm text-muted-foreground'>Last event: {result}</p>
      </div>
    </PromptInputProvider>
  )
}

export const Selectors: Story = {
  render: () => <SelectorGallery />,
}

export const Composer: Story = {
  render: () => <ComposerPlayground />,
}
