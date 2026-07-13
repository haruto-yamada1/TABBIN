import { describe, expect, it } from 'vitest'

import { savedTabsActionSettingsDefaults } from './SavedTabsActionSettingsPolicy'

describe('savedTabsActionSettingsDefaults', () => {
  it('データ変更とウィンドウ操作の既定ポリシーを一箇所で定義する', () => {
    expect(savedTabsActionSettingsDefaults).toStrictEqual({
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      openAllInNewWindow: false,
      removeTabAfterExternalDrop: false,
      removeTabAfterOpen: true,
    })
  })
})
