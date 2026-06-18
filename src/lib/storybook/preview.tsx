import type { Decorator, Preview } from '@storybook/react'
import { useEffect } from 'react'
import { Toaster } from 'sonner'

import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'

import {
  primeStorybookBrowserMocks,
  setStorybookStorage,
} from './browser-mocks'
import { storybookThemeStorage } from './fixtures'

type StoryTheme = 'dark' | 'light' | 'system' | 'user'

interface StorybookHarnessProps {
  children: React.ReactNode
  storage?: Record<string, unknown>
  theme?: StoryTheme
}

interface StorybookParameters {
  storybook?: {
    storage?: Record<string, unknown>
  }
}

const applyThemeClass = (theme: StoryTheme) => {
  const root = document.documentElement
  root.classList.remove('light', 'dark')

  if (theme === 'dark') {
    root.classList.add('dark')
    return
  }

  root.classList.add('light')
}

const getInitialStorage = (
  theme: StoryTheme,
  storage?: Record<string, unknown>,
) => ({
  ...(theme === 'user'
    ? storybookThemeStorage('user')
    : storybookThemeStorage(theme === 'dark' ? 'dark' : 'light')),
  ...storage,
})

const StorybookTestHarness = ({
  children,
  storage,
  theme = 'light',
}: StorybookHarnessProps) => {
  primeStorybookBrowserMocks(getInitialStorage(theme, storage))

  useEffect(() => {
    setStorybookStorage(getInitialStorage(theme, storage))
    applyThemeClass(theme)

    return () => {
      const root = document.documentElement
      root.classList.remove('light', 'dark')
      root.removeAttribute('style')
    }
  }, [storage, theme])

  return (
    <ThemeProvider defaultTheme={theme}>
      <TooltipProvider delayDuration={0}>
        <div className='min-h-screen bg-background p-6 text-foreground'>
          {children}
        </div>
        <Toaster richColors position='top-right' />
      </TooltipProvider>
    </ThemeProvider>
  )
}

const isStoryTheme = (value: string): value is StoryTheme =>
  value === 'dark' ||
  value === 'light' ||
  value === 'system' ||
  value === 'user'

const withAppShell: Decorator = (Story, context) => {
  const parameters = context.parameters as StorybookParameters
  const rawTheme: unknown = context.globals.theme
  const theme =
    typeof rawTheme === 'string' && isStoryTheme(rawTheme) ? rawTheme : 'light'

  return (
    <StorybookTestHarness storage={parameters.storybook?.storage} theme={theme}>
      <Story />
    </StorybookTestHarness>
  )
}

const previewDecorators: Preview['decorators'] = [withAppShell]

const previewGlobalTypes: NonNullable<Preview['globalTypes']> = {
  theme: {
    defaultValue: 'light',
    description: 'Global theme for components',
    toolbar: {
      icon: 'mirror',
      items: ['light', 'dark', 'user'],
      title: 'Theme',
    },
  },
}

const previewParameters: NonNullable<Preview['parameters']> = {
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/i,
    },
  },
  layout: 'padded',
  options: {
    storySort: {
      order: ['UI', 'Components', 'Features', 'AI Elements'],
    },
  },
}

const createPreview = (): Preview => ({
  decorators: previewDecorators,
  globalTypes: previewGlobalTypes,
  parameters: previewParameters,
})

export {
  StorybookTestHarness,
  createPreview,
  previewDecorators,
  previewGlobalTypes,
  previewParameters,
}
