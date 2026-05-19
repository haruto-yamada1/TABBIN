// @covers components/ui/loading-state.tsx
import type { Meta, StoryObj } from '@storybook/react'

import { LoadingState } from './loading-state'

export default {
  args: {
    minHeightClassName: 'min-h-[200px]',
  },
  component: LoadingState,
  title: 'UI/LoadingState',
} satisfies Meta<typeof LoadingState>

type Story = StoryObj<typeof LoadingState>

export const Default: Story = {}

export const Tall: Story = {
  args: {
    minHeightClassName: 'min-h-[300px]',
  },
}
