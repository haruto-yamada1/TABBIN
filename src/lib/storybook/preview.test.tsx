// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider, useI18n } from '@/features/i18n/context/I18nProvider'

import { StorybookTestHarness, createPreview } from './preview'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const LanguageProbe = () => {
  const { language } = useI18n()
  return <div>{language}</div>
}

describe('Storybook preview helpers', () => {
  it('loads the selected locale before rendering localized stories', async () => {
    vi.stubGlobal('navigator', {
      language: 'en',
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      },
    })
    render(
      <StorybookTestHarness locale='ja'>
        <I18nProvider>
          <LanguageProbe />
        </I18nProvider>
      </StorybookTestHarness>,
    )

    expect(await screen.findByText('ja')).toBeTruthy()
  })

  it('provides decorators and global theme toolbar', () => {
    const preview = createPreview()

    expect(preview.decorators?.length).toBeGreaterThan(0)
    expect(preview.globalTypes?.theme?.toolbar).toBeTruthy()
  })

  it('sorts lightweight stories ahead of heavy AI element showcases', () => {
    const preview = createPreview()

    expect(preview.parameters?.options?.storySort).toStrictEqual({
      order: ['UI', 'Components', 'Features', 'AI Elements'],
    })
  })

  it('renders children through the shared harness', () => {
    render(
      <StorybookTestHarness theme='dark'>
        <div>storybook harness</div>
      </StorybookTestHarness>,
    )

    expect(screen.getByText('storybook harness')).toBeTruthy()
  })

  it('does not retain a mounted preview from the previous test', () => {
    expect(screen.queryByText('storybook harness')).toBeNull()
  })
})
