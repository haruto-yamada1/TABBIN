// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const getHiddenFileInput = (container: HTMLElement): HTMLInputElement => {
  const fileInput = container.querySelector(
    'input[type="file"].hidden',
  ) as HTMLInputElement | null
  if (!fileInput) {
    throw new Error('hidden file input not found')
  }
  return fileInput
}

const getDropzoneFileInput = (container: HTMLElement): HTMLInputElement => {
  const fileInputs = Array.from(
    document.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[]
  const dropzoneInput =
    fileInputs.find((input) => !input.classList.contains('hidden')) ??
    fileInputs.find((input) => input !== getHiddenFileInput(container))
  if (!dropzoneInput) {
    throw new Error('dropzone file input not found')
  }
  return dropzoneInput
}

describe('ImportExportSettingsコンポーネント', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    readerMode = 'success'
    readerContent = '{"import":"payload"}'
    readerAsync = false

    ;(globalThis as { [key: string]: unknown }).FileReader =
      MockFileReader as unknown as typeof FileReader
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('データをエクスポートしてバックアップファイルをダウンロードする', async () => {
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

    fireEvent.click(
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
    vi.mocked(exportSettings).mockRejectedValue(new Error('export failed'))

    render(<ImportExportSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Export settings and tab data' }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'An error occurred while exporting',
      )
    })
  })

  it('マージ設定を切り替えるとインポート時に mergeData=false を渡す', async () => {
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'ok',
    })

    const { container } = render(<ImportExportSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Merge with existing data (recommended)',
      }),
    )

    expect(
      screen.getByText('Warning: all existing data will be replaced.'),
    ).toBeTruthy()

    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

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

    fireEvent.change(getHiddenFileInput(container), {
      target: { files: [] },
    })

    await waitFor(() => {
      expect(importSettings).not.toHaveBeenCalled()
    })
  })

  it('dropzone input 経由（onDrop 経路）でファイルを処理する', async () => {
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'ok',
    })

    const { container } = render(<ImportExportSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    fireEvent.change(getDropzoneFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'dropzone.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(importSettings).toHaveBeenCalledWith(
        readerContent,
        true,
        expect.any(Function),
      )
    })
  })

  it('dropzone 上でドラッグ中にドラッグアクティブラベルを表示する', async () => {
    const { container } = render(<ImportExportSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    const dropzone = getDropzoneFileInput(container).parentElement
    if (!dropzone) {
      throw new Error('dropzone container not found')
    }

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
    const { container } = render(<ImportExportSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )

    const dropzone = getDropzoneFileInput(container).parentElement
    if (!dropzone) {
      throw new Error('dropzone container not found')
    }

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

  it('キャンセルボタンをクリックするとダイアログを閉じる', async () => {
    render(<ImportExportSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Import settings and tab data' }),
    )
    expect(screen.getByRole('dialog').textContent).toContain(
      'Import settings and tab data',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('読み込み前に JSON 以外のファイルを拒否する', async () => {
    const { container } = render(<ImportExportSettings />)

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

  it('JSON ファイルを正常にインポートして background に通知する', async () => {
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'Import successful',
    })

    const { container } = render(<ImportExportSettings />)

    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

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
    vi.mocked(importSettings).mockResolvedValue({
      success: false,
      message: 'Validation error',
    })

    const { container } = render(<ImportExportSettings />)

    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Validation error')
    })

    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it('インポートで例外発生時に汎用エラーを表示する', async () => {
    vi.mocked(importSettings).mockRejectedValue(new Error('import failed'))

    const { container } = render(<ImportExportSettings />)

    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to import settings and tab data',
      )
    })
  })

  it('ファイル内容が空のとき読み込みエラーを表示する', async () => {
    readerMode = 'empty'

    const { container } = render(<ImportExportSettings />)

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
    readerMode = 'success'
    readerAsync = true
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'ok',
    })

    const { container, unmount } = render(<ImportExportSettings />)

    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })

    unmount()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(importSettings).toHaveBeenCalledWith(
      readerContent,
      true,
      expect.any(Function),
    )
  })

  it('アンマウント後の非同期 onerror を null の file input ref に触れず処理する', async () => {
    readerMode = 'error'
    readerAsync = true

    const { container, unmount } = render(<ImportExportSettings />)

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
