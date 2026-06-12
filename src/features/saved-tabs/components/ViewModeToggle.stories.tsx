import type { Meta, StoryObj } from '@storybook/react'
import { useReducer } from 'react'
import type { ComponentProps } from 'react'

import { SavedTabsResponsiveLayoutProvider } from '@/features/saved-tabs/contexts/SavedTabsResponsiveLayoutContext'

import { ViewModeToggle } from './ViewModeToggle'

const ViewModeToggleStoryRender = (
  args: ComponentProps<typeof ViewModeToggle>,
) => {
  const [mode, setMode] = useReducer(
    (
      _state: ComponentProps<typeof ViewModeToggle>['currentMode'],
      nextMode: ComponentProps<typeof ViewModeToggle>['currentMode'],
    ) => nextMode,
    args.currentMode,
  )

  return (
    <SavedTabsResponsiveLayoutProvider
      isCompactLayout={args.currentMode === 'custom'}
    >
      <div className='w-72'>
        <ViewModeToggle currentMode={mode} onChange={setMode} />
      </div>
    </SavedTabsResponsiveLayoutProvider>
  )
}

const meta = {
  args: {
    onChange: () => undefined,
  },
  component: ViewModeToggle,
  render: ViewModeToggleStoryRender,
  title: 'Features/SavedTabs/ViewModeToggle',
} satisfies Meta<typeof ViewModeToggle>

type Story = StoryObj<typeof ViewModeToggle>

export const DomainMode: Story = {
  args: {
    currentMode: 'domain',
  },
}

export const CustomMode: Story = {
  args: {
    currentMode: 'custom',
  },
}

export default meta
