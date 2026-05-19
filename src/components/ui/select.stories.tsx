// @covers components/ui/select.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

const SelectStory = () => {
  const [value, setValue] = useState('domain')

  return (
    <div className='w-72'>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue placeholder='表示モードを選択' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='domain'>ドメインモード</SelectItem>
          <SelectItem value='custom'>カスタムモード</SelectItem>
          <SelectItem value='archived'>アーカイブ表示</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

export default {
  component: Select,
  render: () => <SelectStory />,
  title: 'UI/Select',
} satisfies Meta<typeof Select>

type Story = StoryObj<typeof Select>

export const ViewModeSelector: Story = {}
