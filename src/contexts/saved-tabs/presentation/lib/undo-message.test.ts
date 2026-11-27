import { describe, expect, it } from 'vitest'

import { resolveUndoMessageKey } from './undo-message'

describe('resolveUndoMessageKey', () => {
  it('1件の削除では単数形キーを返す', () => {
    expect(resolveUndoMessageKey('savedTabs.undo.deletedTabs', 1)).toBe(
      'savedTabs.undo.deletedTab',
    )
  })

  it('1件の「開いた後に削除」では単数形キーを返す', () => {
    expect(resolveUndoMessageKey('savedTabs.undo.removedAfterOpen', 1)).toBe(
      'savedTabs.undo.removedAfterOpenTab',
    )
  })

  it('2件以上では元のキーを返す', () => {
    expect(resolveUndoMessageKey('savedTabs.undo.deletedTabs', 2)).toBe(
      'savedTabs.undo.deletedTabs',
    )
    expect(resolveUndoMessageKey('savedTabs.undo.removedAfterOpen', 5)).toBe(
      'savedTabs.undo.removedAfterOpen',
    )
  })

  it('対象外のキーは件数によらず元のキーを返す', () => {
    expect(resolveUndoMessageKey('savedTabs.undo.restored', 1)).toBe(
      'savedTabs.undo.restored',
    )
  })
})
