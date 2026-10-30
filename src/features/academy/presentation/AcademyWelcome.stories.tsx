import type { Meta, StoryObj } from '@storybook/react'
import { MemoryRouter } from 'react-router-dom'

import { I18nProvider } from '@/features/i18n/context/I18nProvider'

import { AcademyWelcome } from './AcademyWelcome'
import type { AcademyWelcomeCommands } from './useAcademyWelcome'

const available: AcademyWelcomeCommands = {
  prepareInstall: async () => {},
  claim: async () => true,
  dismiss: async () => {},
}

const meta = {
  component: AcademyWelcome,
  args: { useCases: available },
  render: (args) => (
    <MemoryRouter>
      <I18nProvider>
        <AcademyWelcome {...args} />
      </I18nProvider>
    </MemoryRouter>
  ),
  title: 'Features/Academy/Welcome',
} satisfies Meta<typeof AcademyWelcome>

type Story = StoryObj<typeof meta>

export const FirstInstall: Story = {}
export const ExistingUser: Story = {
  args: { useCases: { ...available, claim: async () => false } },
}
export const SaveFailure: Story = {
  args: {
    useCases: {
      ...available,
      dismiss: async () => {
        throw new Error('Academy choice could not be saved')
      },
    },
  },
}

export default meta
