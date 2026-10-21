import type { Meta, StoryObj } from '@storybook/react'
import { useMemo } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { SavedTabsPage } from '@/contexts/saved-tabs/presentation/pages/SavedTabsPage'
import { SavedTabsChatPanel } from '@/features/ai-chat/components/SavedTabsChatPanel'
import type { SavedTabsChatPanelProps } from '@/features/ai-chat/components/SavedTabsChatPanel'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'
import { getMessages } from '@/features/i18n/messages'
import type { AppLanguage } from '@/features/i18n/messages'
import { OptionsRoute } from '@/features/options/routes/OptionsRoute'

import {
  createVisualSavedTabsComposition,
  visualStoryStorage,
} from './testing/VisualRegression.fixture'

const meta = {
  decorators: [
    (Story) => (
      <I18nProvider>
        <Story />
      </I18nProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    storybook: { storage: visualStoryStorage },
  },
  title: 'App/Visual Regression',
} satisfies Meta

type Story = StoryObj<typeof meta>

const getLocale = (globals: Record<string, unknown>): AppLanguage =>
  globals.locale === 'ja' ? 'ja' : 'en'

const markReady = (canvasElement: HTMLElement, screen: string) => {
  canvasElement.dataset.visualReady = screen
}

const SavedTabsFixture = ({ locale }: { locale: AppLanguage }) => {
  const composition = useMemo(
    () => createVisualSavedTabsComposition(locale),
    [locale],
  )
  return (
    <SavedTabsPage
      {...composition}
      initialCustomProjects={[]}
      initialViewMode='domain'
    />
  )
}

export const SavedTabs: Story = {
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement)
    const locale = getLocale(globals)
    await expect(
      await canvas.findByRole('textbox', {
        name: getMessages(locale)['savedTabs.searchPlaceholder'],
      }),
    ).toBeVisible()
    await expect(
      await canvas.findByText(
        locale === 'ja' ? 'デザインシステムのガイド' : 'Design system guide',
      ),
    ).toBeVisible()
    await expect(
      canvas.getByTestId('saved-tabs-page-presentation'),
    ).toHaveAttribute('data-loading', 'false')
    markReady(canvasElement, 'saved-tabs')
  },
  render: (_, context) => (
    <SavedTabsFixture locale={getLocale(context.globals)} />
  ),
}

export const Options: Story = {
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement)
    const messages = getMessages(getLocale(globals))
    await expect(
      await canvas.findByRole('heading', {
        level: 1,
        name: messages['options.title'],
      }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('button', {
        name: messages['options.importExport.import'],
      }),
    ).toBeEnabled()
    markReady(canvasElement, 'options')
  },
  render: () => <OptionsRoute />,
}

export const Import: Story = {
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement)
    const messages = getMessages(getLocale(globals))
    await userEvent.click(
      await canvas.findByRole('button', {
        name: messages['options.importExport.import'],
      }),
    )
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: messages['options.importExport.dialogTitle'] },
    )
    await expect(within(dialog).getByTestId('import-dropzone')).toBeVisible()
    markReady(canvasElement, 'import')
  },
  render: () => <OptionsRoute />,
}

const noop = () => undefined
const selectModel = async () => true

const getChatProps = (locale: AppLanguage): SavedTabsChatPanelProps => ({
  activeSystemPromptId: 'visual-prompt',
  chatErrorMessage: '',
  historyItems: [],
  historyVariant: 'none',
  input: '',
  layout: {
    isCompactLayout: false,
    isResizing: false,
    mode: 'page',
    showCloseButton: false,
  },
  messages: [
    {
      content:
        locale === 'ja'
          ? '保存したタブを整理する方法を教えてください。'
          : 'How can I organize my saved tabs?',
      id: 'visual-user-message',
      role: 'user',
    },
    {
      content:
        locale === 'ja'
          ? 'タブをプロジェクトごとにまとめ、カテゴリを使って整理できます。\n\n- **デザイン**: ガイドとアクセシビリティ\n- **リサーチ**: 調査メモと参考資料\n\n変更する前に内容を確認できます。'
          : 'Group your tabs by project, then use categories to keep them organized.\n\n- **Design**: guides and accessibility\n- **Research**: notes and reference material\n\nYou can review the changes before applying them.',
      id: 'visual-assistant-message',
      role: 'assistant',
    },
  ],
  modelName: 'llama3.2',
  modelOptions: [{ label: 'llama3.2', name: 'llama3.2' }],
  onClose: noop,
  onCopyConversation: noop,
  onFetchModels: noop,
  onInputChange: noop,
  onOpenSystemPromptManager: noop,
  onResetConversation: noop,
  onResizeStart: noop,
  onSelectModel: selectModel,
  onSelectSuggestion: noop,
  onSelectSystemPrompt: noop,
  onSubmit: noop,
  platform: 'mac',
  setupErrorMessage: '',
  status: {
    isConfigured: true,
    isConversationCopied: false,
    isCopyDisabled: false,
    isLoadingModels: false,
    isOpen: true,
    isSavingModel: false,
    isSubmitting: false,
  },
  systemPrompts: [
    {
      id: 'visual-prompt',
      name: locale === 'ja' ? 'タブ整理アシスタント' : 'Tab organizer',
    },
  ],
  title: locale === 'ja' ? '保存タブのアシスタント' : 'Saved tabs assistant',
})

export const AiChat: Story = {
  play: async ({ canvasElement, globals }) => {
    const canvas = within(canvasElement)
    const locale = getLocale(globals)
    await expect(
      await canvas.findByLabelText(getMessages(locale)['aiChat.pageAria']),
    ).toBeVisible()
    await expect(
      await canvas.findByText(
        locale === 'ja'
          ? '保存したタブを整理する方法を教えてください。'
          : 'How can I organize my saved tabs?',
      ),
    ).toBeVisible()
    await expect(canvas.getByTestId('ai-chat-bottom-dock')).toBeVisible()
    markReady(canvasElement, 'ai-chat')
  },
  render: (_, context) => (
    <div className='mx-auto flex h-[calc(100vh-3rem)] max-w-5xl'>
      <SavedTabsChatPanel {...getChatProps(getLocale(context.globals))} />
    </div>
  ),
}

export default meta
