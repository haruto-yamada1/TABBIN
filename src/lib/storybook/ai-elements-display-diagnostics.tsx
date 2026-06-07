import { Bot, Globe } from 'lucide-react'

import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockLanguageSelector,
  CodeBlockLanguageSelectorContent,
  CodeBlockLanguageSelectorItem,
  CodeBlockLanguageSelectorTrigger,
  CodeBlockLanguageSelectorValue,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block'
import {
  Commit,
  CommitActions,
  CommitAuthor,
  CommitAuthorAvatar,
  CommitContent,
  CommitCopyButton,
  CommitFile,
  CommitFileAdditions,
  CommitFileChanges,
  CommitFileDeletions,
  CommitFileInfo,
  CommitFilePath,
  CommitFileStatus,
  CommitFiles,
  CommitHash,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
  CommitSeparator,
  CommitTimestamp,
} from '@/components/ai-elements/commit'
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation'
import {
  StackTrace,
  StackTraceActions,
  StackTraceContent,
  StackTraceCopyButton,
  StackTraceError,
  StackTraceErrorMessage,
  StackTraceErrorType,
  StackTraceExpandButton,
  StackTraceFrames,
  StackTraceHeader,
} from '@/components/ai-elements/stack-trace'
import {
  Terminal,
  TerminalActions,
  TerminalClearButton,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from '@/components/ai-elements/terminal'
import {
  Test,
  TestDuration,
  TestError,
  TestErrorMessage,
  TestErrorStack,
  TestName,
  TestResults,
  TestResultsContent,
  TestResultsDuration,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  TestStatus,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
} from '@/components/ai-elements/test-results'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'

const sampleTrace = `ReferenceError: browser is not defined
    at openSidebar (/Users/tarou/Desktop/TABBIN/features/navigation/sidebar.ts:42:15)
    at handleClick (/Users/tarou/Desktop/TABBIN/features/navigation/sidebar.ts:68:9)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`
const diagnosticsCommitDate = new Date('2026-03-15T12:00:00Z')

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

const RuntimeDiagnostics = () => (
  <div className='grid gap-6 xl:grid-cols-2'>
    <Section title='Code + Tooling'>
      <div className='space-y-4'>
        <CodeBlock
          code={'export const story = "ready"\n'}
          language='typescript'
        >
          <CodeBlockHeader>
            <CodeBlockTitle>
              <Bot className='size-3.5' />
              <CodeBlockFilename>story.ts</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockLanguageSelector defaultValue='typescript'>
                <CodeBlockLanguageSelectorTrigger className='w-32'>
                  <CodeBlockLanguageSelectorValue />
                </CodeBlockLanguageSelectorTrigger>
                <CodeBlockLanguageSelectorContent>
                  <CodeBlockLanguageSelectorItem value='typescript'>
                    TypeScript
                  </CodeBlockLanguageSelectorItem>
                  <CodeBlockLanguageSelectorItem value='json'>
                    JSON
                  </CodeBlockLanguageSelectorItem>
                </CodeBlockLanguageSelectorContent>
              </CodeBlockLanguageSelector>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>

        <Tool defaultOpen>
          <ToolHeader
            state='output-available'
            title='save-tabs'
            type='tool-save-tabs'
          />
          <ToolContent>
            <ToolInput
              // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
              input={{
                projectId: 'workspace-weekly-review',
                summarize: true,
              }}
            />
            <ToolOutput
              errorText={undefined}
              // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
              output={{ archived: 2, saved: 12, status: 'ok' }}
            />
          </ToolContent>
        </Tool>
      </div>
    </Section>

    <Section title='Commit + Confirmation'>
      <div className='space-y-4'>
        <Commit defaultOpen>
          <CommitHeader>
            <CommitInfo>
              <CommitMessage>
                Expand Storybook coverage for ai-elements
              </CommitMessage>
              <CommitMetadata>
                <CommitHash>a1b2c3d</CommitHash>
                <CommitSeparator />
                <CommitAuthor>
                  <CommitAuthorAvatar initials='TT' />
                </CommitAuthor>
                <CommitSeparator />
                <CommitTimestamp date={diagnosticsCommitDate} />
              </CommitMetadata>
            </CommitInfo>
            <CommitActions>
              <CommitCopyButton hash='a1b2c3d' />
            </CommitActions>
          </CommitHeader>
          <CommitContent>
            <CommitFiles>
              <CommitFile>
                <CommitFileInfo>
                  <Globe className='size-4 text-muted-foreground' />
                  <CommitFilePath>
                    components/ai-elements/display.stories.tsx
                  </CommitFilePath>
                </CommitFileInfo>
                <CommitFileChanges>
                  <CommitFileStatus status='modified' />
                  <CommitFileAdditions count={240} />
                  <CommitFileDeletions count={0} />
                </CommitFileChanges>
              </CommitFile>
            </CommitFiles>
          </CommitContent>
        </Commit>

        <div className='space-y-3'>
          {/* eslint-disable-next-line react-perf/jsx-no-new-object-as-prop */}
          <Confirmation approval={{ id: '1' }} state='approval-requested'>
            <ConfirmationTitle>
              Allow the agent to export saved tabs?
            </ConfirmationTitle>
            <ConfirmationRequest>
              <ConfirmationActions>
                <ConfirmationAction variant='outline'>Deny</ConfirmationAction>
                <ConfirmationAction>Approve</ConfirmationAction>
              </ConfirmationActions>
            </ConfirmationRequest>
          </Confirmation>
          <Confirmation
            // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
            approval={{ approved: true, id: '2' }}
            state='output-available'
          >
            <ConfirmationAccepted>
              <ConfirmationTitle>
                Export approved and completed.
              </ConfirmationTitle>
            </ConfirmationAccepted>
          </Confirmation>
          <Confirmation
            // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
            approval={{ approved: false, id: '3', reason: 'Not needed' }}
            state='output-denied'
          >
            <ConfirmationRejected>
              <ConfirmationTitle>
                Export was rejected by the operator.
              </ConfirmationTitle>
            </ConfirmationRejected>
          </Confirmation>
        </div>
      </div>
    </Section>

    <Section title='Terminal + Stack Trace'>
      <div className='space-y-4'>
        <Terminal
          isStreaming
          // eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
          onClear={() => undefined}
          output={`$ bun run build-storybook\nDone in 4.21s\n`}
        >
          <TerminalHeader>
            <TerminalTitle />
            <div className='flex items-center gap-1'>
              <TerminalStatus />
              <TerminalActions>
                <TerminalCopyButton />
                <TerminalClearButton />
              </TerminalActions>
            </div>
          </TerminalHeader>
          <TerminalContent />
        </Terminal>

        <StackTrace defaultOpen trace={sampleTrace}>
          <StackTraceHeader>
            <StackTraceError>
              <StackTraceErrorType />
              <StackTraceErrorMessage />
            </StackTraceError>
            <StackTraceActions>
              <StackTraceCopyButton />
              <StackTraceExpandButton />
            </StackTraceActions>
          </StackTraceHeader>
          <StackTraceContent>
            <StackTraceFrames showInternalFrames={false} />
          </StackTraceContent>
        </StackTrace>
      </div>
    </Section>

    <Section title='Test Results'>
      <TestResults
        // eslint-disable-next-line react-perf/jsx-no-new-object-as-prop
        summary={{
          duration: 4210,
          failed: 1,
          passed: 24,
          skipped: 2,
          total: 27,
        }}
      >
        <TestResultsHeader>
          <TestResultsSummary />
          <TestResultsDuration />
        </TestResultsHeader>
        <TestResultsContent>
          <TestResultsProgress />
          <TestSuite defaultOpen name='storybook coverage' status='failed'>
            <TestSuiteName />
            <TestSuiteContent className='space-y-2 p-3'>
              <TestSuiteStats passed={24} failed={1} skipped={2} />
              <Test duration={182} name='covers button.tsx' status='passed'>
                <TestStatus />
                <TestName>covers button.tsx</TestName>
                <TestDuration />
              </Test>
              <Test
                duration={611}
                name='covers ai-elements prompt-input.tsx'
                status='failed'
              >
                <TestStatus />
                <TestName>covers ai-elements prompt-input.tsx</TestName>
                <TestDuration />
                <TestError>
                  <TestErrorMessage>
                    Missing story reference for prompt-input.tsx
                  </TestErrorMessage>
                  <TestErrorStack>
                    lib/storybook/component-coverage.test.ts:41:19
                  </TestErrorStack>
                </TestError>
              </Test>
            </TestSuiteContent>
          </TestSuite>
        </TestResultsContent>
      </TestResults>
    </Section>
  </div>
)

export default RuntimeDiagnostics
