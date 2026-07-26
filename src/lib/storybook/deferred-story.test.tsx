// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy } from 'react'
import { describe, expect, it } from 'vitest'

import { DeferredStoryLoader } from './deferred-story'

const HeavyStory = lazy(async () => ({
  default: () => <div>heavy story content</div>,
}))

describe('DeferredStoryLoader', () => {
  it('does not load the heavy story until requested', async () => {
    const user = userEvent.setup()
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

    await user.click(screen.getByRole('button', { name: 'Load heavy story' }))

    await expect(screen.findByText('heavy story content')).resolves.toBeTruthy()
  })
})
