import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest' // eslint-disable-line

vi.mock('@/features/options/hooks/useSettings', () => ({
  useSettings: () => ({
    addExcludePattern: vi.fn(),
    excludePatternInput: '',
    handleExcludePatternInputChange: vi.fn(),
    settings: {
      autoDeletePeriod: 'never',
      clickBehavior: 'saveSameDomainTabs',
      colors: {},
      confirmDeleteAll: false,
      confirmDeleteEach: false,
      enableCategories: true,
      excludePatterns: ['chrome://'],
      excludePinnedTabs: true,
      ollamaModel: '',
      openAllInNewWindow: false,
      openUrlInBackground: true,
      removeTabAfterExternalDrop: true,
      removeTabAfterOpen: true,
      showSavedTime: false,
    },
    removeExcludePattern: vi.fn(),
    setSettings: vi.fn(),
    setExcludePatternInput: vi.fn(),
    isLoading: false,
    updateSetting: vi.fn(),
  }),
}))

vi.mock('@/features/options/hooks/useColorSettings', () => ({
  useColorSettings: () => ({
    handleColorChange: vi.fn(),
    handleResetColors: vi.fn(),
  }),
}))

vi.mock('@/features/options/hooks/useCategories', () => ({
  useCategories: () => ({
    handleCategoryKeyDown: vi.fn(),
  }),
}))

vi.mock('@/features/options/hooks/useAutoDeletePeriod', () => ({
  useAutoDeletePeriod: () => ({
    pendingAutoDeletePeriod: null,
    confirmationState: {
      isOpen: false,
    },
    hideConfirmation: vi.fn(),
    handleAutoDeletePeriodChange: vi.fn(),
    prepareAutoDeletePeriod: vi.fn(),
  }),
}))

vi.mock('@/features/options/ImportExportSettings', () => ({
  ImportExportSettings: () =>
    createElement('div', null, 'ImportExportSettings'),
}))

vi.mock('@/components/ModeToggle', () => ({
  ModeToggle: () => createElement('div', null, 'ModeToggle'),
}))

vi.mock('@/features/i18n/components/LanguageSelect', () => ({
  LanguageSelect: () => createElement('div', null, 'LanguageSelect'),
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => createElement('div', null, 'Toaster'),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string) =>
      (
        ({
          'common.loading': 'Loading...',
          'options.backupRestore': 'Backup & Restore',
          'options.behaviorSettings': 'Tab behavior',
          'options.clickBehaviorLabel': 'Click action',
          'options.clickBehaviorPlaceholder': 'Select click action',
          'options.excludePatterns.title': 'Exclude settings',
          'options.title': 'Options',
        }) satisfies Record<string, string>
      )[key] ?? key,
  }),
}))

import { OptionsPage } from '@/features/options/routes/OptionsRoute'

describe('オプションページ', () => {
  it('AI チャット設定セクションを表示しない', () => {
    render(createElement(OptionsPage))

    expect(screen.queryByText('AI チャット')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Options' })).toBeTruthy()
    expect(screen.getByText('LanguageSelect')).toBeTruthy()
    expect(screen.getByText('ModeToggle')).toBeTruthy()
    expect(screen.getByText('Backup & Restore')).toBeTruthy()
    expect(screen.getByText('Exclude settings')).toBeTruthy()
  })
})
