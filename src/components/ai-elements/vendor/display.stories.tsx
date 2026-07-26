// @covers components/ai-elements/vendor/agent.tsx
// @covers components/ai-elements/vendor/artifact.tsx
// @covers components/ai-elements/attachments.tsx
// @covers components/ai-elements/vendor/chain-of-thought.tsx
// @covers components/ai-elements/vendor/checkpoint.tsx
// @covers components/ai-elements/code-block.tsx
// @covers components/ai-elements/vendor/commit.tsx
// @covers components/ai-elements/vendor/confirmation.tsx
// @covers components/ai-elements/vendor/context.tsx
// @covers components/ai-elements/vendor/environment-variables.tsx
// @covers components/ai-elements/vendor/file-tree.tsx
// @covers components/ai-elements/vendor/image.tsx
// @covers components/ai-elements/vendor/inline-citation.tsx
// @covers components/ai-elements/jsx-preview.tsx
// @covers components/ai-elements/vendor/package-info.tsx
// @covers components/ai-elements/vendor/persona.tsx
// @covers components/ai-elements/vendor/plan.tsx
// @covers components/ai-elements/vendor/schema-display.tsx
// @covers components/ai-elements/shimmer.tsx
// @covers components/ai-elements/vendor/snippet.tsx
// @covers components/ai-elements/vendor/stack-trace.tsx
// @covers components/ai-elements/streamdown-renderer.tsx
// @covers components/ai-elements/vendor/terminal.tsx
// @covers components/ai-elements/vendor/test-results.tsx
// @covers components/ai-elements/tool.tsx
// @covers components/ai-elements/vendor/transcription.tsx
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
