// @covers components/ui/button.tsx
import type { Meta, StoryObj } from '@storybook/react'

import { Button } from './button'

export default {
  args: {
    children: '保存する',
    size: 'default',
    variant: 'default',
  },
  component: Button,
  title: 'UI/Button',
} satisfies Meta<typeof Button>

type Story = StoryObj<typeof Button>

export const Primary: Story = {}

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
}

export const Destructive: Story = {
  args: {
    children: '削除する',
    variant: 'destructive',
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}
