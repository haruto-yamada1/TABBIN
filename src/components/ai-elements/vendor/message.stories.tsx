// @covers components/ai-elements/message.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Copy, ThumbsUp } from 'lucide-react'

import {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
} from '../message'

export default {
  args: {
    from: 'assistant',
  },
  component: Message,
  title: 'AI Elements/Message',
} satisfies Meta<typeof Message>

type Story = StoryObj<typeof Message>

export const Conversation: Story = {
  render: () => (
    <div className='space-y-4'>
      <Message from='assistant'>
        <MessageContent>
          保存済みタブをドメインごとに 4 グループへ再整理しました。
        </MessageContent>
        <MessageActions>
          <MessageAction tooltip='コピー'>
            <Copy size={14} />
          </MessageAction>
          <MessageAction tooltip='よい回答'>
            <ThumbsUp size={14} />
          </MessageAction>
        </MessageActions>
      </Message>

      <Message from='user'>
        <MessageContent>未分類タブだけをあとで見返したいです。</MessageContent>
      </Message>
    </div>
  ),
}

export const Branching: Story = {
  render: () => (
    <MessageBranch>
      <MessageBranchContent>
        <Message from='assistant' key='compact'>
          <MessageContent>要約を短く表示する案です。</MessageContent>
        </Message>
        <Message from='assistant' key='verbose'>
          <MessageContent>
            詳しい説明と次の操作候補を並べる案です。
          </MessageContent>
        </Message>
      </MessageBranchContent>
      <MessageBranchSelector>
        <MessageBranchPrevious />
        <MessageBranchPage />
        <MessageBranchNext />
      </MessageBranchSelector>
    </MessageBranch>
  ),
}
