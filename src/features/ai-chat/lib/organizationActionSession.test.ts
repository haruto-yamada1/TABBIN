import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  readOrganizationActionOutcome,
  rememberOrganizationActionOutcome,
} from './organizationActionSession'

const createOutcome = () => ({
  notificationFailed: false,
  preview: {
    expiresAt: 1_800_000,
    id: 'preview',
    proposal: { kind: 'delete_urls' as const, urlIds: ['url-1'] },
    revision: 1,
    targets: [],
  },
  status: 'applied' as const,
  undoId: 'undo',
})

afterEach(() => vi.useRealTimers())

describe('organizationActionSession', () => {
  it('keeps a scoped result for navigation, then drops it at its session expiry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const outcome = createOutcome()
    rememberOrganizationActionOutcome('expiry', outcome)
    expect(readOrganizationActionOutcome('expiry')).toEqual(outcome)
    expect(readOrganizationActionOutcome('other-conversation')).toBeUndefined()
    vi.setSystemTime(1_800_000)
    expect(readOrganizationActionOutcome('expiry')).toBeUndefined()
  })

  it('bounds retained results and discards expired or completed entries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000_000)
    rememberOrganizationActionOutcome('expired', createOutcome())
    vi.setSystemTime(4_000_000)
    rememberOrganizationActionOutcome('completed', {
      ...createOutcome(),
      status: 'undone',
      undoId: null,
    })
    for (let index = 0; index < 21; index += 1) {
      rememberOrganizationActionOutcome(`bounded-${index}`, createOutcome())
    }
    expect(readOrganizationActionOutcome('expired')).toBeUndefined()
    expect(readOrganizationActionOutcome('completed')).toBeUndefined()
    expect(readOrganizationActionOutcome('bounded-0')).toBeUndefined()
    expect(readOrganizationActionOutcome('bounded-20')).toBeDefined()
  })
})
