// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { lazy } from 'react'
import { describe, expect, it } from 'vitest' // eslint-disable-line

import { DeferredStoryLoader } from './deferred-story'

// eslint-disable-next-line typescript/require-await
const HeavyStory = lazy(async () => ({
  default: () => <div>heavy story content</div>,
}))

describe('DeferredStoryLoader', () => {
  it('does not load the heavy story until requested', async () => {
    render(
      <DeferredStoryLoader
        buttonLabel='Load heavy story'
        component={HeavyStory}
        description='Loads a heavy showcase on demand.'
        title='Heavy story'
      />,
    )

    expect(screen.getByText('Heavy story')).toBeTruthy()
    expect(screen.queryByText('heavy story content')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Load heavy story' }))

    await expect(screen.findByText('heavy story content')).resolves.toBeTruthy()
  })
})
