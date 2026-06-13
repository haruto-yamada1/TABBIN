// @vitest-environment jsdom
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import * as inputStories from '@/components/ai-elements/inputs.stories'
import * as messageStories from '@/components/ai-elements/message.stories'
import * as modeToggleStories from '@/components/mode-toggle.stories'
import * as buttonStories from '@/components/ui/button.stories'
import * as viewModeStories from '@/contexts/saved-tabs/presentation/components/ViewModeToggle.stories'
import * as ollamaStories from '@/features/ai-chat/components/OllamaErrorNotice.stories'
import * as headerStories from '@/features/navigation/components/ExtensionPageHeader.stories'
import * as importExportStories from '@/features/options/ImportExportSettings.stories'

import preview from '../../../.storybook/preview'

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'ja',
    t: (key: string) =>
      (
        ({
          'aiChat.ollama.connectionUrl': '接続先 URL:',
          'options.importExport.export': '設定とタブデータをエクスポート',
          'options.importExport.import': '設定とタブデータをインポート',
          'options.importExport.merge': '既存データとマージする（推奨）',
          'options.importExport.cancel': 'キャンセル',
          'sidebar.tabList': 'タブ一覧',
          'savedTabs.viewMode.custom': 'カスタムモード',
          'savedTabs.viewMode.domain': 'ドメインモード',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

const { Primary } = composeStories(buttonStories, preview)
const { Conversation } = composeStories(messageStories, preview)
const { Composer } = composeStories(inputStories, preview)
const { ToggleMenu: ModeToggleDefault } = composeStories(
  modeToggleStories,
  preview,
)
const { Idle: ImportExportDefault } = composeStories(
  importExportStories,
  preview,
)
const { WithDescription } = composeStories(headerStories, preview)
const { CustomMode } = composeStories(viewModeStories, preview)
const { ForbiddenOnMac } = composeStories(ollamaStories, preview)

describe('storybook smoke stories', () => {
  beforeEach(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn()
    }
  })

  it('renders representative stories from each family', () => {
    render(
      <div>
        <Primary />
        <Conversation />
        <Composer />
        <ModeToggleDefault />
        <ImportExportDefault />
        <WithDescription />
        <CustomMode />
        <ForbiddenOnMac />
      </div>,
    )

    expect(screen.getByRole('button', { name: /theme|テーマ/i })).toBeTruthy()
    expect(
      screen.getByText(
        '保存済みタブをドメインごとに 4 グループへ再整理しました。',
      ),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: /設定とタブデータをエクスポート/i,
      }),
    ).toBeTruthy()
    expect(screen.getByText(/Weekly review/i)).toBeTruthy()
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
    expect(screen.getByText(/接続先 URL:/)).toBeTruthy()
  })
})
