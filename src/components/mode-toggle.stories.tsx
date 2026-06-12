// @covers components/mode-toggle.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { userEvent, within } from 'storybook/test'

import { ModeToggle } from './mode-toggle'

const meta = {
  component: ModeToggle,
  title: 'Components/ModeToggle',
} satisfies Meta<typeof ModeToggle>

type Story = StoryObj<typeof ModeToggle>

export const ToggleMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: /テーマの切り替え/i }),
    )
  },
}

export default meta
