import { ArrowUpRight, FileText } from 'lucide-react'

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtImage,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from '@/components/ai-elements/context'
import {
  EnvironmentVariable,
  EnvironmentVariableCopyButton,
  EnvironmentVariableGroup,
  EnvironmentVariableName,
  EnvironmentVariableRequired,
  EnvironmentVariableValue,
  EnvironmentVariables,
  EnvironmentVariablesContent,
  EnvironmentVariablesHeader,
  EnvironmentVariablesTitle,
  EnvironmentVariablesToggle,
} from '@/components/ai-elements/environment-variables'
import {
  FileTree,
  FileTreeActions,
  FileTreeFile,
  FileTreeFolder,
  FileTreeName,
} from '@/components/ai-elements/file-tree'
import { Image } from '@/components/ai-elements/image'
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationQuote,
  InlineCitationSource,
  InlineCitationText,
} from '@/components/ai-elements/inline-citation'
import {
  JSXPreview,
  JSXPreviewContent,
  JSXPreviewError,
} from '@/components/ai-elements/jsx-preview'
import {
  PackageInfo,
  PackageInfoChangeType,
  PackageInfoContent,
  PackageInfoDependencies,
  PackageInfoDependency,
  PackageInfoDescription,
  PackageInfoHeader,
  PackageInfoName,
  PackageInfoVersion,
} from '@/components/ai-elements/package-info'
import {
  SchemaDisplay,
  SchemaDisplayContent,
  SchemaDisplayDescription,
  SchemaDisplayHeader,
  SchemaDisplayMethod,
  SchemaDisplayParameter,
  SchemaDisplayParameters,
  SchemaDisplayPath,
  SchemaDisplayProperty,
  SchemaDisplayRequest,
  SchemaDisplayResponse,
} from '@/components/ai-elements/schema-display'
import { Shimmer } from '@/components/ai-elements/shimmer'

const samplePng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+AP7m8kG6QAAAABJRU5ErkJggg=='

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

const DataSurfaces = () => (
  // eslint-disable-line eslint/max-lines-per-function
  <div className='grid gap-6 xl:grid-cols-2'>
    <Section title='Context + Chain of Thought'>
      <div className='gap-y-4'>
        <Context
          maxTokens={128_000}
          modelId='openai/gpt-4.1-mini'
          usage={{
            inputTokens: 8200,
            inputTokenDetails: {
              cacheReadTokens: undefined,
              cacheWriteTokens: undefined,
              noCacheTokens: undefined,
            },
            outputTokens: 1200,
            outputTokenDetails: {
              reasoningTokens: undefined,
              textTokens: undefined,
            },
            totalTokens: 9400,
          }}
          usedTokens={18_400}
        >
          <ContextTrigger />
          <ContextContent>
            <ContextContentHeader />
            <ContextContentBody className='gap-y-3'>
              <ContextInputUsage />
              <ContextOutputUsage />
              <ContextReasoningUsage />
              <ContextCacheUsage />
            </ContextContentBody>
            <ContextContentFooter />
          </ContextContent>
        </Context>

        <ChainOfThought defaultOpen>
          <ChainOfThoughtHeader />
          <ChainOfThoughtContent>
            <ChainOfThoughtStep
              description='6 relevant tabs matched product review work.'
              label='Scanned active window'
              status='complete'
            />
            <ChainOfThoughtStep
              description='One duplicate doc and one stale issue were detected.'
              label='Ranked cleanup candidates'
              status='active'
            >
              <ChainOfThoughtSearchResults>
                <ChainOfThoughtSearchResult>docs</ChainOfThoughtSearchResult>
                <ChainOfThoughtSearchResult>github</ChainOfThoughtSearchResult>
              </ChainOfThoughtSearchResults>
              <ChainOfThoughtImage caption='Captured comparison snapshot'>
                <img
                  alt='comparison'
                  className='max-h-56 rounded-lg border'
                  src={`data:image/png;base64,${samplePng}`}
                />
              </ChainOfThoughtImage>
            </ChainOfThoughtStep>
          </ChainOfThoughtContent>
        </ChainOfThought>
      </div>
    </Section>

    <Section title='Schema + Package Info'>
      <div className='gap-y-4'>
        <PackageInfo
          changeType='minor'
          currentVersion='1.6.0'
          name='tabbin-ai'
          newVersion='1.7.0'
        >
          <PackageInfoHeader>
            <PackageInfoName />
            <PackageInfoChangeType />
          </PackageInfoHeader>
          <PackageInfoVersion />
          <PackageInfoDescription>
            Adds Storybook harnesses for AI chat and saved-tab workflows.
          </PackageInfoDescription>
          <PackageInfoContent>
            <PackageInfoDependencies>
              <PackageInfoDependency name='storybook' version='9.0.0' />
              <PackageInfoDependency name='@xyflow/react' version='12.8.0' />
            </PackageInfoDependencies>
          </PackageInfoContent>
        </PackageInfo>

        <SchemaDisplay
          description='Creates or updates a saved-tab review batch.'
          method='POST'
          // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
          parameters={[
            {
              description: 'Workspace id',
              location: 'path',
              name: 'workspaceId',
              required: true,
              type: 'string',
            },
          ]}
          path='/api/workspaces/{workspaceId}/review-batches'
          // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
          requestBody={[
            {
              description: 'Model to use',
              name: 'model',
              required: true,
              type: 'string',
            },
            {
              description: 'Pinned items to keep',
              items: { name: 'projectId', type: 'string' },
              name: 'projects',
              type: 'array',
            },
          ]}
          // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
          responseBody={[
            {
              description: 'Review batch id',
              name: 'id',
              required: true,
              type: 'string',
            },
          ]}
        >
          <SchemaDisplayHeader>
            <SchemaDisplayMethod />
            <SchemaDisplayPath />
          </SchemaDisplayHeader>
          <SchemaDisplayDescription />
          <SchemaDisplayContent>
            <SchemaDisplayParameters defaultOpen>
              <SchemaDisplayParameter
                description='Workspace id'
                location='path'
                name='workspaceId'
                required
                type='string'
              />
            </SchemaDisplayParameters>
            <SchemaDisplayRequest defaultOpen>
              <SchemaDisplayProperty
                description='Primary AI model'
                name='model'
                required
                type='string'
              />
            </SchemaDisplayRequest>
            <SchemaDisplayResponse defaultOpen>
              <SchemaDisplayProperty
                description='Created batch id'
                name='id'
                required
                type='string'
              />
            </SchemaDisplayResponse>
          </SchemaDisplayContent>
        </SchemaDisplay>
      </div>
    </Section>

    <Section title='Environment Variables + File Tree'>
      <div className='gap-y-4'>
        <EnvironmentVariables defaultShowValues>
          <EnvironmentVariablesHeader>
            <EnvironmentVariablesTitle />
            <EnvironmentVariablesToggle />
          </EnvironmentVariablesHeader>
          <EnvironmentVariablesContent>
            <EnvironmentVariable
              name='OPENAI_API_KEY'
              value='sk-1234567890abcdef'
            >
              <EnvironmentVariableGroup>
                <EnvironmentVariableName />
                <EnvironmentVariableRequired />
              </EnvironmentVariableGroup>
              <EnvironmentVariableGroup>
                <EnvironmentVariableValue />
                <EnvironmentVariableCopyButton />
              </EnvironmentVariableGroup>
            </EnvironmentVariable>
          </EnvironmentVariablesContent>
        </EnvironmentVariables>

        <FileTree
          className='max-w-xl'
          defaultExpanded={new Set(['src', 'src/components'])}
          selectedPath='src/components/ai-elements/display.stories.tsx'
        >
          <FileTreeFolder name='src' path='src'>
            <FileTreeFolder name='components' path='src/components'>
              <FileTreeFile
                name='ai-elements'
                path='src/components/ai-elements'
              >
                <span className='size-4' />
                <FileText className='size-4 text-muted-foreground' />
                <FileTreeName>ai-elements</FileTreeName>
                <FileTreeActions>
                  <ArrowUpRight className='size-3.5 text-muted-foreground' />
                </FileTreeActions>
              </FileTreeFile>
              <FileTreeFile
                name='display.stories.tsx'
                path='src/components/ai-elements/display.stories.tsx'
              />
            </FileTreeFolder>
          </FileTreeFolder>
        </FileTree>
      </div>
    </Section>

    <Section title='Image + Citation + JSX Preview'>
      <div className='gap-y-4'>
        <Image
          alt='Generated cover'
          base64={samplePng}
          className='max-w-48'
          mediaType='image/png'
          uint8Array={new Uint8Array()}
        />

        <InlineCitation>
          <InlineCitationText>
            Weekly cleanup removed the duplicate Notion doc
          </InlineCitationText>
          <InlineCitationCard>
            <InlineCitationCardTrigger
              // eslint-disable-next-line react-perf/jsx-no-new-array-as-prop
              sources={[
                'https://tabbin.app/blog/storybook-workflow',
                'https://docs.storybook.js.org',
              ]}
            />
            <InlineCitationCardBody>
              <InlineCitationCarousel>
                <InlineCitationCarouselHeader>
                  <InlineCitationCarouselPrev />
                  <InlineCitationCarouselIndex />
                  <InlineCitationCarouselNext />
                </InlineCitationCarouselHeader>
                <InlineCitationCarouselContent>
                  <InlineCitationCarouselItem>
                    <InlineCitationSource
                      description='Storybook keeps UI states isolated and reviewable.'
                      title='Storybook workflow'
                      url='https://tabbin.app/blog/storybook-workflow'
                    />
                    <InlineCitationQuote>
                      Capture states before wiring them into feature flows.
                    </InlineCitationQuote>
                  </InlineCitationCarouselItem>
                </InlineCitationCarouselContent>
              </InlineCitationCarousel>
            </InlineCitationCardBody>
          </InlineCitationCard>
        </InlineCitation>

        <JSXPreview
          // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
          bindings={{ count: 12 }}
          className='gap-y-3 rounded-lg border p-3'
          jsx='<div><strong>{count}</strong> saved tabs ready for review.</div>'
        >
          <JSXPreviewContent />
          <JSXPreviewError />
        </JSXPreview>

        <div className='text-sm'>
          <Shimmer>Streaming structured response…</Shimmer>
        </div>
      </div>
    </Section>
  </div>
)

export default DataSurfaces
