// @covers lib/react/RenderErrorBoundary.tsx
import type { Meta, StoryObj } from '@storybook/react'

import { RenderErrorBoundary } from '@/lib/react/RenderErrorBoundary'

const FailedFeature = () => {
  throw new Error('Storybook render failure')
}

const exportUnavailable = async () => {
  throw new Error('Export unavailable')
}

const RecoveryPreview = () => (
  <RenderErrorBoundary onExport={exportUnavailable}>
    <FailedFeature />
  </RenderErrorBoundary>
)

const meta = {
  component: RecoveryPreview,
  title: 'Components/RenderErrorBoundary',
} satisfies Meta<typeof RecoveryPreview>

type Story = StoryObj<typeof RecoveryPreview>

export const Recovery: Story = {}

export default meta
