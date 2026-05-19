// @covers components/ui/accordion.tsx
// @covers components/ui/alert-dialog.tsx
// @covers components/ui/avatar.tsx
// @covers components/ui/badge.tsx
// @covers components/ui/button-group.tsx
// @covers components/ui/card.tsx
// @covers components/ui/carousel.tsx
// @covers components/ui/chart.tsx
// @covers components/ui/checkbox.tsx
// @covers components/ui/collapsible.tsx
// @covers components/ui/command.tsx
// @covers components/ui/dropdown-menu.tsx
// @covers components/ui/field.tsx
// @covers components/ui/hover-card.tsx
// @covers components/ui/input-group.tsx
// @covers components/ui/input.tsx
// @covers components/ui/label.tsx
// @covers components/ui/popover.tsx
// @covers components/ui/progress.tsx
// @covers components/ui/scroll-area.tsx
// @covers components/ui/separator.tsx
// @covers components/ui/sheet.tsx
// @covers components/ui/sidebar.tsx
// @covers components/ui/skeleton.tsx
// @covers components/ui/sonner.tsx
// @covers components/ui/spinner.tsx
// @covers components/ui/switch.tsx
// @covers components/ui/textarea.tsx
// @covers components/ui/tooltip.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { lazy } from 'react'

import { DeferredStoryLoader } from '@/lib/storybook/deferred-story'

const UiShowcase = lazy(() => import('@/lib/storybook/ui-showcase-foundations'))
const DataShowcase = lazy(
  () => import('@/lib/storybook/ui-showcase-data-layout'),
)

export default {
  title: 'UI/Showcase',
} satisfies Meta

type Story = StoryObj

export const Foundations: Story = {
  render: () => (
    <DeferredStoryLoader
      buttonLabel='Load foundations showcase'
      component={UiShowcase}
      description='Loads the full UI foundations showcase only when requested.'
      title='UI Foundations'
    />
  ),
}

export const DataAndLayout: Story = {
  render: () => (
    <DeferredStoryLoader
      buttonLabel='Load data and layout showcase'
      component={DataShowcase}
      description='Loads the data and layout showcase on demand to keep Storybook responsive.'
      title='Data And Layout'
    />
  ),
}
