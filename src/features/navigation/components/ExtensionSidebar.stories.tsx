import type { Meta, StoryObj } from '@storybook/react'

import { SidebarProvider } from '@/components/ui/sidebar'
import {
  analyticsSidebarState,
  savedTabsSidebarState,
} from '@/lib/storybook/fixtures'

import { ExtensionSidebar } from './ExtensionSidebar'

const meta = {
  component: ExtensionSidebar,
  render: (args) => {
    window.localStorage.setItem('tabbin-extension-sidebar-width', '256')

    return (
      <div className='h-[640px] overflow-hidden rounded-xl border'>
        <SidebarProvider>
          <ExtensionSidebar {...args} />
        </SidebarProvider>
      </div>
    )
  },
  title: 'Features/Navigation/ExtensionSidebar',
} satisfies Meta<typeof ExtensionSidebar>

type Story = StoryObj<typeof ExtensionSidebar>

export const SavedTabs: Story = {
  args: {
    state: savedTabsSidebarState,
  },
}

export const Analytics: Story = {
  args: {
    state: analyticsSidebarState,
  },
}

export default meta
