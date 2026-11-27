import { describe, expect, it } from 'vitest'

import { resolveCustomProjectDisplayName } from './custom-project-display-name'

const t = (key: string) =>
  key === 'savedTabs.uncategorized' ? 'Uncategorized' : key

describe('resolveCustomProjectDisplayName', () => {
  it('既定プロジェクトが初期名のままなら辞書名を返す', () => {
    expect(
      resolveCustomProjectDisplayName(
        { id: 'custom-uncategorized', name: '未分類' },
        t,
      ),
    ).toBe('Uncategorized')
  })

  it('既定プロジェクトをリネーム済みなら保存名を返す', () => {
    expect(
      resolveCustomProjectDisplayName(
        { id: 'custom-uncategorized', name: 'あとで読む' },
        t,
      ),
    ).toBe('あとで読む')
  })

  it('通常プロジェクトが同じ名前でも保存名を返す', () => {
    expect(
      resolveCustomProjectDisplayName({ id: 'project-1', name: '未分類' }, t),
    ).toBe('未分類')
  })
})
