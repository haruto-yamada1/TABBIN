// @covers components/ui/alert.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { AlertCircle, ShieldAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from './alert'

export default {
  component: Alert,
  render: (args) => (
    <Alert {...args}>
      {args.variant === 'destructive' ? (
        <ShieldAlert className='size-4' />
      ) : (
        <AlertCircle className='size-4' />
      )}
      <AlertTitle>同期ステータス</AlertTitle>
      <AlertDescription>
        Storybook 上で確認しやすい代表状態をまとめています。
      </AlertDescription>
    </Alert>
  ),
  title: 'UI/Alert',
} satisfies Meta<typeof Alert>

type Story = StoryObj<typeof Alert>

export const StatusNotice: Story = {}

export const DestructiveAlert: Story = {
  args: {
    variant: 'destructive',
  },
}
