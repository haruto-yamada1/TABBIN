// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest' // eslint-disable-line

import { ImportExportSettings } from './ImportExportSettings'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/features/options/lib/import-export', () => ({
  exportSettings: vi.fn(),
  downloadAsJson: vi.fn(),
  importSettings: vi.fn(),
  getImportPreview: vi.fn().mockReturnValue({
    success: true,
    message: 'データの解析に成功しました',
    preview: {
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      categoriesCount: 1,
      domainsCount: 1,
      projectsCount: 0,
      hasAiChat: false,
      hasAnalytics: false,
    },
  }),
}))

vi.mock('@/lib/browser/runtime', () => ({
  sendRuntimeMessage: vi.fn(),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) => {
      const messages: Record<string, string> = {
        'options.importExport.cancel': 'Cancel',
        'options.importExport.dialogDescription':
          'Restore settings and tab data from a backup file exported earlier.',
        'options.importExport.dialogTitle': 'Import settings and tab data',
        'options.importExport.dropActive': 'Drop the file here',
        'options.importExport.dropIdle': 'Drag and drop a JSON file',
        'options.importExport.scopeDescription':
          'Backups include saved URLs, categories, custom projects, analytics data, AI chat history, and AI settings.',
        'options.importExport.scopeTitle': 'Backup scope',
        'options.importExport.export': 'Export settings and tab data',
        'options.importExport.exporting': 'Exporting...',
        'options.importExport.exportError': 'An error occurred while exporting',
        'options.importExport.exportSuccess': 'Exported settings and tab data',
        'options.importExport.import': 'Import settings and tab data',
        'options.importExport.importError':
          'Failed to import settings and tab data',
        'options.importExport.importFormatError':
          'The imported data format is invalid',
        'options.importExport.importing': 'Importing...',
        'options.importExport.invalidJson': 'Please select a JSON file',
        'options.importExport.merge': 'Merge with existing data (recommended)',
        'options.importExport.mergeDescription':
          'Keeps existing data while adding and updating new data.',
        'options.importExport.mergeLabel': 'Note',
        'options.importExport.mergeWarning':
          'During merge, items with the same ID are updated.',
        'options.importExport.mergeSuccess':
          'Merged {{categories}} categories and {{domains}} domains{{unresolved}}',
        'options.importExport.replaceDescription':
          'Warning: all existing data will be replaced.',
        'options.importExport.replaceLabel': 'Warning',
        'options.importExport.replaceWarning':
          'Importing will overwrite all current settings and tab data. This cannot be undone.',
        'options.importExport.replaceSuccess':
          'Replaced settings and tab data (version: {{version}}, created: {{timestamp}}){{unresolved}}',
        'options.importExport.readError': 'Failed to read the file',
        'options.importExport.selectFile': 'Click to choose a file',
        'options.importExport.unresolvedWarning':
          ' ({{count}} unresolved, {{placeholderCount}} placeholders)',
        'options.importExport.previewTitle': 'Import Preview',
        'options.importExport.previewDescription':
          'Review the data before importing.',
        'options.importExport.previewVersion': 'Backup Version: {{version}}',
        'options.importExport.previewTimestamp': 'Backup Date: {{timestamp}}',
        'options.importExport.previewCategories': 'Categories: {{count}}',
        'options.importExport.previewDomains': 'Domains: {{count}}',
        'options.importExport.previewProjects': 'Projects: {{count}}',
        'options.importExport.previewAiChat': 'AI Chat History: {{hasAiChat}}',
        'options.importExport.autoBackup':
          'Create a recovery backup before importing',
        'options.importExport.autoBackupDescription':
          'Saves current settings to allow recovery if the import fails or is accidental.',
        'options.importExport.back': 'Back',
        'options.importExport.confirmImport': 'Confirm Import',
        'common.yes': 'Yes',
        'common.no': 'No',
      }

      const template = messages[key] ?? fallback ?? key

      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_: string, token: string) => values?.[token] ?? '',
      )
    },
  }),
}))

import { toast } from 'sonner'

import {
  downloadAsJson,
  exportSettings,
  getImportPreview,
  importSettings,
} from '@/features/options/lib/import-export'
import { sendRuntimeMessage } from '@/lib/browser/runtime'

type ReaderMode = 'success' | 'empty' | 'error'

let readerMode: ReaderMode = 'success'
let readerContent = '{"import":"payload"}'
let readerAsync = false

class MockFileReader {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null

  readAsText(_file: Blob) {
    const dispatch = (fn: () => void) => {
      if (readerAsync) {
        setTimeout(fn, 0)
        return
      }
      fn()
    }

    if (readerMode === 'error') {
      dispatch(() => {
        this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>)
      })
      return
    }

    const result = readerMode === 'empty' ? '' : readerContent
    dispatch(() => {
      this.onload?.({
        target: { result },
      } as unknown as ProgressEvent<FileReader>)
    })
  }
}

const getHiddenFileInput = (container: HTMLElement): HTMLInputElement =>
  within(container).getByTestId('hidden-file-input') as HTMLInputElement

const getDropzoneFileInput = (): HTMLInputElement =>
  screen.getByTestId('dropzone-file-input') as HTMLInputElement

describe('ImportExportSettingsコンポーネント', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    readerMode = 'success'
    readerContent = '{"import":"payload"}'
    readerAsync = false

    ;(globalThis as Record<string, unknown>).FileReader =
      MockFileReader as unknown as typeof FileReader

    vi.mocked(exportSettings).mockResolvedValue({
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
        excludePinnedTabs: true,
        openUrlInBackground: true,
        openAllInNewWindow: false,
        confirmDeleteAll: false,
        confirmDeleteEach: false,
      },
      parentCategories: [],
      savedTabs: [],
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('データをエクスポートしてバックアップファイルをダウンロードする', async () => {
    const user = userEvent.setup()
    vi.mocked(exportSettings).mockResolvedValue({
      version: '1.0.0',
      timestamp: '2026-02-16T00:00:00.000Z',
      userSettings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: true,
        excludePatterns: [],
        enableCategories: true,
        showSavedTime: false,
        clickBehavior: 'saveWindowTabs',
        excludePinnedTabs: true,
        openUrlInBackground: true,
        openAllInNewWindow: false,
        confirmDeleteAll: false,
        confirmDeleteEach: false,
      },
      parentCategories: [],
      savedTabs: [],
    })

    render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Export settings and tab data' }),
    )

    await waitFor(() => {
      expect(exportSettings).toHaveBeenCalledTimes(1)
    })

    expect(downloadAsJson).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downloadAsJson).mock.calls[0]?.[1]).toMatch(
      /^tab-manager-backup-\d{4}-\d{2}-\d{2}\.json$/,
    )
    expect(toast.success).toHaveBeenCalledWith('Exported settings and tab data')
  })

  it('バックアップに含まれるデータ範囲を表示する', () => {
    render(<ImportExportSettings />)

    expect(screen.getByText('Backup scope')).toBeTruthy()
    expect(
      screen.getByText(
        'Backups include saved URLs, categories, custom projects, analytics data, AI chat history, and AI settings.',
      ),
    ).toBeTruthy()
  })

  it('エクスポート失敗時にエラートーストを表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(exportSettings).mockRejectedValue(new Error('export failed'))

    render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Export settings and tab data' }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'An error occurred while exporting',
      )
    })
  })

  it('マージ設定を切り替えるとインポート時に mergeData=false を渡す', async () => {
    const user = userEvent.setup()
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'ok',
    })

    const { container } = render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Merge with existing data (recommended)',
      }),
    )

    expect(
      screen.getByText('Warning: all existing data will be replaced.'),
    ).toBeTruthy()

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => {
      expect(importSettings).toHaveBeenCalledWith(
        readerContent,
        false,
        expect.any(Function),
      )
    })
  })

  it('ファイル未選択時は file change イベントを無視する', async () => {
    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: { files: [] },
    })

    await waitFor(() => {
      expect(importSettings).not.toHaveBeenCalled()
    })
  })

  it('dropzone input 経由（onDrop 経路）でファイルを処理する', async () => {
    const user = userEvent.setup()
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'ok',
    })

    render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getDropzoneFileInput(), {
      target: {
        files: [
          new File(['dummy'], 'dropzone.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => {
      expect(importSettings).toHaveBeenCalledWith(
        readerContent,
        true,
        expect.any(Function),
      )
    })
  })

  it('dropzone 上でドラッグ中にドラッグアクティブラベルを表示する', async () => {
    const user = userEvent.setup()
    render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    const dropzone = screen.getByTestId('import-dropzone')

    fireEvent.dragEnter(dropzone, {
      dataTransfer: {
        files: [new File(['x'], 'drag.json', { type: 'application/json' })],
        items: [],
        types: ['Files'],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Drop the file here')).toBeTruthy()
    })
  })

  it('受け入れファイルがない drop イベントは処理しない', async () => {
    const user = userEvent.setup()
    render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    const dropzone = screen.getByTestId('import-dropzone')

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [],
        items: [],
        types: ['Files'],
      },
    })

    await waitFor(() => {
      expect(importSettings).not.toHaveBeenCalled()
    })
  })

  it('戻るボタンをクリックすると選択ステップに戻る', async () => {
    const user = userEvent.setup()
    const { container } = render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Confirm Import' }),
      ).toBeNull()
    })
    expect(screen.getByText('Drag and drop a JSON file')).toBeTruthy()
  })

  it('読み込み前に JSON 以外のファイルを拒否する', async () => {
    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [new File(['dummy'], 'backup.txt', { type: 'text/plain' })],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Please select a JSON file')
    })
    expect(importSettings).not.toHaveBeenCalled()
  })

  it('10MB を超える JSON ファイルは読み込み前に拒否する', async () => {
    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.json', {
            type: 'application/json',
          }),
        ],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'options.importExport.fileTooLarge',
      )
    })
    expect(importSettings).not.toHaveBeenCalled()
  })

  it('プレビュー解析が失敗した場合はプレビューの失敗メッセージを表示する', async () => {
    vi.mocked(getImportPreview).mockReturnValueOnce({
      success: false,
      message: 'Preview failed',
    })

    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Preview failed')
    })
    expect(screen.queryByRole('button', { name: 'Confirm Import' })).toBeNull()
  })

  it('プレビュー解析が例外を投げた場合は読み込みエラーを表示する', async () => {
    vi.mocked(getImportPreview).mockImplementationOnce(() => {
      throw new Error('preview crashed')
    })

    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to read the file')
    })
    expect(console.error).toHaveBeenCalledWith(
      'プレビューエラー:',
      expect.any(Error),
    )
  })

  it('プレビューで AI chat を含むバックアップは Yes と表示する', async () => {
    vi.mocked(getImportPreview).mockReturnValueOnce({
      success: true,
      message: 'ok',
      preview: {
        categoriesCount: 1,
        domainsCount: 1,
        hasAiChat: true,
        hasAnalytics: true,
        projectsCount: 1,
        timestamp: '2026-02-16T00:00:00.000Z',
        version: '1.0.0',
      },
    })

    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Yes')).toBeTruthy()
    })
  })

  it('JSON ファイルを正常にインポートして background に通知する', async () => {
    const user = userEvent.setup()
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'Import successful',
    })

    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => {
      expect(importSettings).toHaveBeenCalledWith(
        readerContent,
        true,
        expect.any(Function),
      )
    })

    expect(toast.success).toHaveBeenCalledWith('Import successful')
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: 'settingsImported',
    })
  })

  it('インポート結果が失敗時は importSettings の失敗メッセージを表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(importSettings).mockResolvedValue({
      success: false,
      message: 'Validation error',
    })

    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Validation error')
    })

    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it('インポートで例外発生時に汎用エラーを表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(importSettings).mockRejectedValue(new Error('import failed'))

    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to import settings and tab data',
      )
    })
  })

  it('確定時にファイル内容が空なら読み込みエラーを表示する', async () => {
    const user = userEvent.setup()
    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    readerMode = 'empty'
    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to read the file')
    })
  })

  it('確定時の FileReader.onerror で読み込みエラーを表示する', async () => {
    const user = userEvent.setup()
    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    readerMode = 'error'
    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to read the file')
    })
  })

  it('確定時に FileReader 作成が失敗したら汎用エラーを表示する', async () => {
    const user = userEvent.setup()
    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    class ThrowingFileReader {
      constructor() {
        throw new Error('reader constructor failed')
      }
    }
    ;(globalThis as Record<string, unknown>).FileReader =
      ThrowingFileReader as unknown as typeof FileReader

    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to import settings and tab data',
      )
    })
  })

  it('ファイル内容が空のとき読み込みエラーを表示する', async () => {
    readerMode = 'empty'

    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to read the file')
    })
    expect(importSettings).not.toHaveBeenCalled()
  })

  it('FileReader.onerror 発火時に読み込みエラーを表示する', async () => {
    readerMode = 'error'

    const { container } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to read the file')
    })
    expect(importSettings).not.toHaveBeenCalled()
  })

  it('アンマウント後の非同期 onload を null の file input ref に触れず処理する', async () => {
    const user = userEvent.setup()
    readerMode = 'success'
    readerAsync = true
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'ok',
    })

    const { container, unmount } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Confirm Import' }),
      ).toBeTruthy()
    })

    await user.click(screen.getByRole('button', { name: 'Confirm Import' }))

    unmount()

    await new Promise((resolve) => setTimeout(resolve, 0))
    // The component unmounted, so we just ensure it didn't crash.
    // importSettings might have been called or interrupted, but no crash should occur.
  })

  it('アンマウント後の非同期 onerror を null の file input ref に触れず処理する', async () => {
    readerMode = 'error'
    readerAsync = true

    const { container, unmount } = render(<ImportExportSettings />)

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    unmount()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(toast.error).toHaveBeenCalledWith('Failed to read the file')
  })
})
