import type { MouseEvent } from 'react'
import { describe, expect, it } from 'vitest'

import { isManagedLinkActivation } from './linkActivation'

type LinkActivationEvent = Pick<
  MouseEvent<HTMLAnchorElement>,
  'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>

const createEvent = (
  overrides: Partial<LinkActivationEvent> = {},
): LinkActivationEvent => ({
  altKey: false,
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides,
})

describe('isManagedLinkActivation', () => {
  it('修飾キーなしの左クリックだけをTABBIN管理対象にする', () => {
    expect(isManagedLinkActivation(createEvent())).toBe(true)
  })

  it('修飾キー付きクリックと中央クリックはブラウザへ委譲する', () => {
    for (const event of [
      createEvent({ altKey: true }),
      createEvent({ ctrlKey: true }),
      createEvent({ metaKey: true }),
      createEvent({ shiftKey: true }),
      createEvent({ button: 1 }),
    ]) {
      expect(isManagedLinkActivation(event)).toBe(false)
    }
  })
})
