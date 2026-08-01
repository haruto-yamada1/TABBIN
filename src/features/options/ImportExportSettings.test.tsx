// @vitest-environment jsdom
import {
  act,
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

vi.mock('@/app/composition/optionsBackupV2Export', () => ({
  exportBackupV2: vi.fn(),
}))

vi.mock('@/app/composition/optionsBackupRecovery', () => ({
  listBackupRecoverySnapshots: vi.fn(),
  restoreBackupRecoverySnapshot: vi.fn(),
}))

vi.mock('@/lib/browser/runtime', () => ({
  sendRuntimeMessage: vi.fn(),
}))

vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    language: 'en',
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
        'options.importExport.compatibilityTitle': 'Backup format',
        'options.importExport.compatibilityWarning':
          'Backups created with older versions can no longer be imported on or after {{cutoffDate}}.',
        'options.importExport.compatibilityAction':
          'Import any required backups by {{lastSupportedDate}}, then export them again in the new format.',
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
        'options.importExport.legacyPreviewTitle': 'Legacy backup',
        'options.importExport.legacyPreviewWarning':
          'This legacy backup can no longer be imported on or after {{cutoffDate}}.',
        'options.importExport.legacyPreviewAction':
          'After importing, export a new-format backup again.',
        'options.importExport.autoBackup':
          'Create a recovery backup before importing',
        'options.importExport.autoBackupDescription':
          'Saves current settings to allow recovery if the import fails or is accidental.',
        'options.importExport.recoveryDescription':
          'Created {{createdAt}}. Available until {{expiresAt}}.',
        'options.importExport.recoveryRestore': 'Restore original data',
        'options.importExport.recoveryRestoreConfirmAction': 'Restore now',
        'options.importExport.recoveryRestoreConfirmDescription':
          'Replace current data with this recovery point?',
        'options.importExport.recoveryRestoreConfirmTitle':
          'Restore the data from before import?',
        'options.importExport.recoveryRestoreError':
          'Could not restore the original data',
        'options.importExport.recoveryRestoreSuccess':
          'Restored the original data',
        'options.importExport.recoveryRestoring': 'Restoring...',
        'options.importExport.recoveryTitle': 'Recovery point available',
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
  listBackupRecoverySnapshots,
  restoreBackupRecoverySnapshot,
} from '@/app/composition/optionsBackupRecovery'
import { exportBackupV2 } from '@/app/composition/optionsBackupV2Export'
import type { PersistenceRecoverySnapshotSummary } from '@/contexts/saved-tabs/public-api'
import {
  downloadAsJson,
  getImportPreview,
  importSettings,
} from '@/features/options/lib/import-export'
import { sendRuntimeMessage } from '@/lib/browser/runtime'
import { BACKUP_RESOURCE_LIMITS } from '@/lib/persistence/backupResourcePolicy'

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

const recoverySnapshot = {
  createdAt: Date.UTC(2026, 6, 29, 12),
  expiresAt: Date.UTC(2026, 7, 5, 12),
  id: '00000000-0000-4000-8000-000000000740',
  serializedBytes: 1_024,
  sourceRevision: 1,
} as const satisfies PersistenceRecoverySnapshotSummary

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
    vi.mocked(listBackupRecoverySnapshots).mockResolvedValue([])
    vi.mocked(restoreBackupRecoverySnapshot).mockResolvedValue({
      notification: {
        event: {
          changeId: 'recovery-change',
          revision: 3,
          scopes: ['recoverySnapshots'],
        },
        kind: 'committed_and_published',
      },
      revision: 3,
    })
    vi.mocked(sendRuntimeMessage).mockResolvedValue(undefined)

    ;(globalThis as Record<string, unknown>).FileReader =
      MockFileReader as unknown as typeof FileReader

    vi.mocked(exportBackupV2).mockResolvedValue({
      appVersion: '2.0.8',
      data: {
        analyticsViews: [],
        conversations: [],
        messages: [],
        savedTabs: {
          categories: [],
          collections: [],
          groups: [],
          memberships: [],
          urls: [],
        },
        userSettings: {
          clickBehavior: 'saveWindowTabs',
          confirmDeleteAll: false,
          confirmDeleteEach: false,
          enableCategories: true,
          excludePatterns: [],
          excludePinnedTabs: true,
          openAllInNewWindow: false,
          openUrlInBackground: true,
          removeTabAfterExternalDrop: true,
          removeTabAfterOpen: true,
          showSavedTime: false,
        },
      },
      exportedAt: '2026-02-16T00:00:00.000Z',
      schemaVersion: 2,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('データをエクスポートしてバックアップファイルをダウンロードする', async () => {
    const user = userEvent.setup()
    render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Export settings and tab data' }),
    )

    await waitFor(() => {
      expect(exportBackupV2).toHaveBeenCalledTimes(1)
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

  it('旧backup期限と再エクスポート案内を常設表示する', () => {
    render(<ImportExportSettings />)

    expect(screen.getByText('Backup format')).toBeTruthy()
    expect(
      screen.getByText(
        'Backups created with older versions can no longer be imported on or after September 1, 2026.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Import any required backups by August 31, 2026, then export them again in the new format.',
      ),
    ).toBeTruthy()
  })

  it('保存済み回復ポイントを表示し確認後に元のデータへ戻す', async () => {
    const user = userEvent.setup()
    vi.mocked(listBackupRecoverySnapshots).mockResolvedValue([recoverySnapshot])

    render(<ImportExportSettings />)

    expect(await screen.findByText('Recovery point available')).toBeTruthy()
    await user.click(
      screen.getByRole('button', { name: 'Restore original data' }),
    )
    expect(
      screen.getByText('Restore the data from before import?'),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Restore now' }))

    await waitFor(() => {
      expect(restoreBackupRecoverySnapshot).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000740',
      )
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: 'settingsImported',
      })
      expect(toast.success).toHaveBeenCalledWith('Restored the original data')
    })
  })

  it('復元後の通知失敗を復元失敗として表示しない', async () => {
    const user = userEvent.setup()
    const secret = 'https://secret.example.test/private'
    vi.mocked(listBackupRecoverySnapshots).mockResolvedValue([recoverySnapshot])
    vi.mocked(sendRuntimeMessage).mockRejectedValue(new Error(secret))

    render(<ImportExportSettings />)
    await screen.findByText('Recovery point available')
    await user.click(
      screen.getByRole('button', { name: 'Restore original data' }),
    )
    await user.click(screen.getByRole('button', { name: 'Restore now' }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Restored the original data')
    })
    expect(toast.error).not.toHaveBeenCalledWith(
      'Could not restore the original data',
    )
    expect(restoreBackupRecoverySnapshot).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret,
    )
  })

  it('復元失敗時は内容をログへ出さず失敗を通知する', async () => {
    const user = userEvent.setup()
    const secret = 'https://secret.example.test/private'
    vi.mocked(listBackupRecoverySnapshots).mockResolvedValue([recoverySnapshot])
    vi.mocked(restoreBackupRecoverySnapshot).mockRejectedValue(
      new Error(secret),
    )

    render(<ImportExportSettings />)
    await screen.findByText('Recovery point available')
    await user.click(
      screen.getByRole('button', { name: 'Restore original data' }),
    )
    await user.click(screen.getByRole('button', { name: 'Restore now' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Could not restore the original data',
      )
    })
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret,
    )
  })

  it('古い一覧取得結果でインポート後の回復ポイントを上書きしない', async () => {
    const user = userEvent.setup()
    let resolveInitialRequest:
      | ((snapshots: readonly PersistenceRecoverySnapshotSummary[]) => void)
      | undefined
    const initialRequest = new Promise<
      readonly PersistenceRecoverySnapshotSummary[]
    >((resolve) => {
      resolveInitialRequest = resolve
    })
    vi.mocked(listBackupRecoverySnapshots)
      .mockImplementationOnce(async () => initialRequest)
      .mockResolvedValueOnce([recoverySnapshot])
    vi.mocked(importSettings).mockResolvedValue({
      success: true,
      message: 'Import successful',
    })

    const { container } = render(<ImportExportSettings />)
    // user.upload internally calls user.click which fails on hidden inputs.
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: {
        files: [
          new File(['dummy'], 'backup.json', { type: 'application/json' }),
        ],
      },
    })
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Import' }),
    )

    expect(await screen.findByText('Recovery point available')).toBeTruthy()
    await act(async () => {
      resolveInitialRequest?.([])
      await initialRequest
    })
    expect(screen.getByText('Recovery point available')).toBeTruthy()
  })

  it('エクスポート失敗時にエラートーストを表示する', async () => {
    const user = userEvent.setup()
    const secret = 'https://secret.example.test/private'
    vi.mocked(exportBackupV2).mockRejectedValue(new Error(secret))

    render(<ImportExportSettings />)

    await user.click(
      screen.getByRole('button', { name: 'Export settings and tab data' }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'An error occurred while exporting',
      )
    })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      secret,
    )
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
        { importDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
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
        { importDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
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

  it('旧10MiB上限を超えても共有Backup上限内なら読み込む', async () => {
    const { container } = render(<ImportExportSettings />)
    const file = new File(['dummy'], 'supported.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 })
    const readAsText = vi.spyOn(MockFileReader.prototype, 'readAsText')

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(readAsText).toHaveBeenCalledWith(file)
      expect(getImportPreview).toHaveBeenCalledWith(readerContent)
    })
    expect(toast.error).not.toHaveBeenCalledWith(
      'options.importExport.fileTooLarge',
    )
  })

  it('共有Backup上限を超えるJSONは読み込み前に拒否する', async () => {
    const { container } = render(<ImportExportSettings />)
    const file = new File(['dummy'], 'too-large.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'size', {
      value: BACKUP_RESOURCE_LIMITS.maxSerializedBytes + 1,
    })
    const readAsText = vi.spyOn(MockFileReader.prototype, 'readAsText')

    // user.upload internally calls user.click which fails on hidden inputs (pointer-events: none)
    // eslint-disable-next-line testing-library/prefer-user-event
    fireEvent.change(getHiddenFileInput(container), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'options.importExport.fileTooLarge',
      )
    })
    expect(readAsText).not.toHaveBeenCalled()
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
    expect(screen.queryByText('Legacy backup')).toBeNull()
  })

  it('legacy backup preview に期限 warning を表示する', async () => {
    const user = userEvent.setup()
    vi.mocked(getImportPreview).mockReturnValueOnce({
      success: true,
      message: 'ok',
      preview: {
        categoriesCount: 1,
        domainsCount: 1,
        hasAiChat: false,
        hasAnalytics: false,
        legacyBackupAdvisory: {
          cutoffDate: '2026-09-01',
          lastSupportedDate: '2026-08-31',
          requiresReExport: true,
        },
        projectsCount: 0,
        timestamp: '2026-02-16T00:00:00.000Z',
        version: '1.0.0',
      },
    })

    const { container } = render(<ImportExportSettings />)

    await user.upload(
      getHiddenFileInput(container),
      new File(['dummy'], 'legacy-backup.json', {
        type: 'application/json',
      }),
    )

    expect(await screen.findByText('Legacy backup')).toBeTruthy()
    expect(
      screen.getByText(
        'This legacy backup can no longer be imported on or after September 1, 2026.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText('After importing, export a new-format backup again.'),
    ).toBeTruthy()
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
        { importDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
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
