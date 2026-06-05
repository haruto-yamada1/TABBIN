import { describe, expect, it, vi } from 'vitest'

import {
  getScopedNounActionLabel,
  getScopedObjectActionLabel,
  getScopedSortLabel,
} from './accessibility'

describe('saved-tabs accessibility label helpers', () => {
  it('対象名がない場合は action/sort label をそのまま返す', () => {
    const t = vi.fn()

    expect(getScopedNounActionLabel(t, undefined, '削除')).toBe('削除')
    expect(getScopedObjectActionLabel(t, undefined, '開く')).toBe('開く')
    expect(getScopedSortLabel(t, undefined, '昇順')).toBe('昇順')
    expect(t).not.toHaveBeenCalled()
  })
})
