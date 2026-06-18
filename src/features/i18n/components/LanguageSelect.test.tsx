// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { defaultSettings } from '@/lib/storage/settings'

import { I18nProvider, useI18n } from '../context/I18nProvider'
import { LanguageSelect } from './LanguageSelect'

const mockedSettings = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}))

vi.mock('@/lib/storage/settings', async () => {
  // eslint-disable-next-line typescript/consistent-type-imports
  const actual = await vi.importActual<typeof import('@/lib/storage/settings')>(
    '@/lib/storage/settings',
  )

  return {
    ...actual,
    getUserSettings: mockedSettings.getUserSettings,
    saveUserSettings: mockedSettings.saveUserSettings,
  }
})

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode
    onValueChange?: (value: string) => void
    value?: string
  }) => (
    <select
      aria-label='language-select'
      onChange={(event) => onValueChange?.(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
}))

const MessageProbe = () => {
  const { t } = useI18n()
  return <div>{t('sidebar.chat')}</div>
}

describe('LanguageSelect', () => {
  it('選択変更で表示言語を切り替え、設定を保存する', async () => {
    mockedSettings.getUserSettings.mockResolvedValue({
      ...defaultSettings,
      language: 'system',
    })
    mockedSettings.saveUserSettings.mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'ja-JP',
    })

    render(
      <I18nProvider>
        <LanguageSelect />
        <MessageProbe />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('チャット')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('language-select'), {
      target: { value: 'en' },
    })

    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeTruthy()
    })
    expect(mockedSettings.saveUserSettings).toHaveBeenCalledWith({
      ...defaultSettings,
      language: 'en',
    })
  })
})
