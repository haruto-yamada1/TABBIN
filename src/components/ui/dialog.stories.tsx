// @covers components/ui/dialog.tsx
import type { Meta, StoryObj } from '@storybook/react'

import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'

export default {
  component: Dialog,
  render: (args) => (
    <Dialog {...args}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>タブを整理しますか？</DialogTitle>
          <DialogDescription>
            いま開いているタブを保存し、作業用に一覧をリセットします。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant='secondary'>キャンセル</Button>
          <Button>整理する</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  title: 'UI/Dialog',
} satisfies Meta<typeof Dialog>

type Story = StoryObj<typeof Dialog>

export const Open: Story = {
  args: {
    open: true,
  },
}
