// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ExtensionPageHeader } from './ExtensionPageHeader'

describe('ExtensionPageHeader', () => {
  it('タイトルと説明を表示し、サイドバー開閉ボタンを出さない', () => {
    render(
      <ExtensionPageHeader
        title='定期実行'
        description='保存したタブを自動で開く設定です'
      />,
    )

    expect(screen.getByRole('heading', { name: '定期実行' })).toBeTruthy()
    expect(screen.getByText('保存したタブを自動で開く設定です')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
