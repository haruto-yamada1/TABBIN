import type { Meta, StoryObj } from '@storybook/react'

import { ExtensionPageHeader } from './ExtensionPageHeader'

const meta = {
  args: {
    title: '保存済みタブ',
  },
  component: ExtensionPageHeader,
  title: 'Features/Navigation/ExtensionPageHeader',
} satisfies Meta<typeof ExtensionPageHeader>

type Story = StoryObj<typeof ExtensionPageHeader>

export const TitleOnly: Story = {}

export const WithDescription: Story = {
  args: {
    description:
      'ドメイン別とカスタム別の 2 つの表示モードを行き来しながら整理します。',
  },
}

export default meta
