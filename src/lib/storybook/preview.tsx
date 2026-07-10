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

type StorybookHarnessProps = {
  children: React.ReactNode
  storage?: Record<string, unknown>
  theme?: StoryTheme
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const getStorybookStorage = (
  parameters: unknown,
): Record<string, unknown> | undefined => {
  if (!isRecord(parameters)) {
    return undefined
  }
  const storybook: unknown = Reflect.get(parameters, 'storybook')
  if (!isRecord(storybook)) {
    return undefined
  }
  const storage: unknown = Reflect.get(storybook, 'storage')
  return isRecord(storage) ? storage : undefined
}

const withAppShell: Decorator = (Story, context) => {
  const storybookStorage = getStorybookStorage(context.parameters)
  const rawTheme: unknown = context.globals.theme
  const theme =
    typeof rawTheme === 'string' && isStoryTheme(rawTheme) ? rawTheme : 'light'

  return (
    <StorybookTestHarness storage={storybookStorage} theme={theme}>
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
