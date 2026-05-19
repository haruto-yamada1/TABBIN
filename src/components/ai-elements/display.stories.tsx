// @covers components/ai-elements/agent.tsx
// @covers components/ai-elements/artifact.tsx
// @covers components/ai-elements/attachments.tsx
// @covers components/ai-elements/chain-of-thought.tsx
// @covers components/ai-elements/checkpoint.tsx
// @covers components/ai-elements/code-block.tsx
// @covers components/ai-elements/commit.tsx
// @covers components/ai-elements/confirmation.tsx
// @covers components/ai-elements/context.tsx
// @covers components/ai-elements/environment-variables.tsx
// @covers components/ai-elements/file-tree.tsx
// @covers components/ai-elements/image.tsx
// @covers components/ai-elements/inline-citation.tsx
// @covers components/ai-elements/jsx-preview.tsx
// @covers components/ai-elements/package-info.tsx
// @covers components/ai-elements/persona.tsx
// @covers components/ai-elements/plan.tsx
// @covers components/ai-elements/schema-display.tsx
// @covers components/ai-elements/shimmer.tsx
// @covers components/ai-elements/snippet.tsx
// @covers components/ai-elements/stack-trace.tsx
// @covers components/ai-elements/terminal.tsx
// @covers components/ai-elements/test-results.tsx
// @covers components/ai-elements/tool.tsx
// @covers components/ai-elements/transcription.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { lazy } from 'react'

import { DeferredStoryLoader } from '@/lib/storybook/deferred-story'

const ReviewArtifacts = lazy(
  () => import('@/lib/storybook/ai-elements-display-review'),
)
const DataSurfaces = lazy(
  () => import('@/lib/storybook/ai-elements-display-data'),
)
const RuntimeDiagnostics = lazy(
  () => import('@/lib/storybook/ai-elements-display-diagnostics'),
)

export default {
  title: 'AI Elements/Display',
} satisfies Meta

type Story = StoryObj

export const Review: Story = {
  render: () => (
    <DeferredStoryLoader
      buttonLabel='Load review gallery'
      component={ReviewArtifacts}
      description='Loads the full review and artifact showcase only when you need it.'
      title='Review Gallery'
    />
  ),
}

export const Data: Story = {
  render: () => (
    <DeferredStoryLoader
      buttonLabel='Load data surfaces'
      component={DataSurfaces}
      description='Loads the data-oriented AI element gallery on demand.'
      title='Data Surfaces'
    />
  ),
}

export const Diagnostics: Story = {
  render: () => (
    <DeferredStoryLoader
      buttonLabel='Load diagnostics gallery'
      component={RuntimeDiagnostics}
      description='Loads diagnostics, terminal, and test result surfaces only on request.'
      title='Diagnostics Gallery'
    />
  ),
}
