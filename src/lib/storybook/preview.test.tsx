// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StorybookTestHarness, createPreview } from './preview'

describe('Storybook preview helpers', () => {
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
})
