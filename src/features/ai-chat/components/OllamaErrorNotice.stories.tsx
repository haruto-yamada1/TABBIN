import type { Meta, StoryObj } from '@storybook/react'

import {
  ollamaConnectionError,
  ollamaForbiddenError,
} from '@/lib/storybook/fixtures'

import { OllamaErrorNotice } from './OllamaErrorNotice'

const meta = {
  args: {
    platform: 'mac',
  },
  component: OllamaErrorNotice,
  render: (args) => <OllamaErrorNotice className='max-w-xl' {...args} />,
  title: 'Features/AiChat/OllamaErrorNotice',
} satisfies Meta<typeof OllamaErrorNotice>

type Story = StoryObj<typeof OllamaErrorNotice>

export const ForbiddenOnMac: Story = {
  args: {
    error: ollamaForbiddenError,
    platform: 'mac',
  },
}

export const NotRunningOnWindows: Story = {
  args: {
    error: ollamaConnectionError,
    platform: 'win',
  },
}

export default meta
