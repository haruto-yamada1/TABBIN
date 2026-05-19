// @covers components/theme-provider.tsx
import type { Meta, StoryObj } from '@storybook/react'

import { Button } from '@/components/ui/button'

import { useTheme } from './theme-provider'

const ThemeConsumer = () => {
  const { theme, setTheme } = useTheme()

  return (
    <div className='flex items-center gap-3'>
      <span className='rounded-md border px-3 py-2 text-sm'>{theme}</span>
      <Button onClick={() => setTheme('light')} variant='outline'>
        Light
      </Button>
      <Button onClick={() => setTheme('dark')} variant='outline'>
        Dark
      </Button>
      <Button onClick={() => setTheme('user')} variant='outline'>
        User
      </Button>
    </div>
  )
}

const meta = {
  component: ThemeConsumer,
  title: 'Components/ThemeProvider',
} satisfies Meta<typeof ThemeConsumer>

type Story = StoryObj<typeof ThemeConsumer>

export const ThemeSwitcher: Story = {}

export default meta
