// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { exportBackupV2 } from '@/app/composition/optionsBackupV2Export'
import { getMessages } from '@/features/i18n/messages'
import { downloadAsJson } from '@/features/options/lib/import-export'
import {
  createDomainCollectionFixture,
  createExamplePersistenceFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import { ExportBackupDialog } from './ExportBackupDialog'
import {
  BackupEnvelopeV2Schema,
  PersistenceV2SnapshotSchema,
} from './lib/import-export/v2/BackupV2Schema'
import type { BackupEnvelopeV2 } from './lib/import-export/v2/BackupV2Schema'
import backupFixture from './lib/import-export/v2/fixtures/backup-v2-current.json'

vi.mock('@/app/composition/optionsBackupV2Export', () => ({
  exportBackupV2: vi.fn(),
}))
vi.mock('@/features/options/lib/import-export', () => ({
  downloadAsJson: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/i18n/context/I18nProvider', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string, values?: Record<string, string>) => {
      const messages: Readonly<Record<string, string>> = getMessages('en')
      const template = messages[key] ?? fallback ?? key
      return template.replaceAll(
        /\{\{(\w+)\}\}/g,
        (_: string, token: string) => values?.[token] ?? '',
      )
    },
  }),
}))

import { toast } from 'sonner'

const createBackup = (): BackupEnvelopeV2 => {
  const savedTabs = createExamplePersistenceFixture(1)
  return BackupEnvelopeV2Schema.parse({
    ...backupFixture,
    data: {
      ...backupFixture.data,
      savedTabs: {
        ...savedTabs,
        collections: [
          ...savedTabs.collections,
          createDomainCollectionFixture('private', 'private.example', 1),
        ],
        memberships: [
          ...savedTabs.memberships,
          {
            ...createMembershipFixture('private', 'private-url', 1),
            notes: 'private note',
          },
        ],
        urls: [
          ...savedTabs.urls,
          createUrlFixture(
            'private-url',
            'https://private.example/?secret=value',
            'Private',
            1,
          ),
        ],
      },
      userSettings: {
        ...backupFixture.data.userSettings,
        excludePatterns: ['private setting'],
      },
      conversations: [
        { id: 'conversation', updatedAt: 1, value: { title: 'private chat' } },
      ],
      messages: [
        {
          id: 'message',
          conversationId: 'conversation',
          createdAt: 1,
          value: 'private message',
        },
      ],
      analyticsViews: [{ id: 'view', updatedAt: 1, value: 'private view' }],
    },
  })
}

const openPreview = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole('button', { name: 'Export settings and tab data' }),
  )
  await screen.findByRole('checkbox', { name: 'Saved tabs' })
  return screen.getByRole('dialog')
}

describe('ExportBackupDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(exportBackupV2).mockResolvedValue(createBackup())
    vi.mocked(downloadAsJson).mockResolvedValue(undefined)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('exports only the reviewed selection without re-reading newer data', async () => {
    const user = userEvent.setup()
    render(<ExportBackupDialog />)
    const dialog = await openPreview(user)
    expect(downloadAsJson).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('button', { name: 'Download JSON backup' }),
    ).toBeDisabled()
    for (const checkbox of within(dialog).getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked()
    }
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Saved tabs' }),
    )
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'private.example' }),
    )
    const counts = within(dialog).getByRole('region', {
      name: 'Records in the selected backup',
    })
    expect(counts).toHaveTextContent('URL1')
    const newer = createBackup()
    newer.data.savedTabs = PersistenceV2SnapshotSchema.parse({
      ...newer.data.savedTabs,
      urls: [
        ...newer.data.savedTabs.urls,
        createUrlFixture('new', 'https://new.example/', 'New', 2),
      ],
    })
    vi.mocked(exportBackupV2).mockResolvedValue(newer)
    await user.click(
      within(dialog).getByRole('button', { name: 'Download JSON backup' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(exportBackupV2).toHaveBeenCalledTimes(1)
    expect(downloadAsJson).toHaveBeenCalledTimes(1)
    const payload = BackupEnvelopeV2Schema.parse(
      vi.mocked(downloadAsJson).mock.calls[0]?.[0],
    )
    expect(payload.data.savedTabs.urls.map(({ id }) => id)).toEqual([
      'url-example',
    ])
    expect(JSON.stringify(payload)).not.toContain('private')
    expect(JSON.stringify(payload)).not.toContain('new.example')
    expect(payload.data.messages).toEqual([])
    expect(payload.data.analyticsViews).toEqual([])
  })

  it('cancels without a file and resets all choices when reopened', async () => {
    const user = userEvent.setup()
    render(<ExportBackupDialog />)
    const dialog = await openPreview(user)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Settings' }))
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(downloadAsJson).not.toHaveBeenCalled()
    const reopened = await openPreview(user)
    expect(exportBackupV2).toHaveBeenCalledTimes(2)
    expect(
      within(reopened).getByRole('checkbox', { name: 'Settings' }),
    ).not.toBeChecked()
    expect(
      within(reopened).getByRole('button', { name: 'Download JSON backup' }),
    ).toBeDisabled()
  })

  it('ignores an old read that finishes after closing and opening a new preview', async () => {
    const user = userEvent.setup()
    let finishOld!: (backup: BackupEnvelopeV2) => void
    vi.mocked(exportBackupV2).mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve
      }),
    )
    render(<ExportBackupDialog />)
    await user.click(
      screen.getByRole('button', { name: 'Export settings and tab data' }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing backup preview...',
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    const dialog = await openPreview(user)
    const old = createBackup()
    old.data.savedTabs = {
      ...old.data.savedTabs,
      collections: old.data.savedTabs.collections.map((collection) => ({
        ...collection,
        name: 'Obsolete collection',
      })),
    }
    await act(async () => {
      finishOld(old)
    })
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Saved tabs' }),
    )
    expect(within(dialog).queryByText('Obsolete collection')).toBeNull()
    expect(
      within(dialog).getByRole('checkbox', { name: 'example.com' }),
    ).toBeChecked()
  })

  it('retains the preview after a download failure and allows a safe retry', async () => {
    const user = userEvent.setup()
    const secret = 'https://private.example/token'
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(downloadAsJson).mockRejectedValueOnce(new Error(secret))
    render(<ExportBackupDialog />)
    const dialog = await openPreview(user)
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Saved tabs' }),
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Download JSON backup' }),
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'An error occurred while exporting settings and tab data',
      ),
    )
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(secret)
    await user.click(
      within(dialog).getByRole('button', { name: 'Download JSON backup' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(downloadAsJson).toHaveBeenCalledTimes(2)
    expect(exportBackupV2).toHaveBeenCalledTimes(1)
  })

  it('locks selection and cancellation while a single download is in flight', async () => {
    const user = userEvent.setup()
    let finishDownload!: () => void
    vi.mocked(downloadAsJson).mockReturnValueOnce(
      new Promise((resolve) => {
        finishDownload = resolve
      }),
    )
    render(<ExportBackupDialog />)
    const dialog = await openPreview(user)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Settings' }))
    await user.dblClick(
      within(dialog).getByRole('button', { name: 'Download JSON backup' }),
    )
    expect(downloadAsJson).toHaveBeenCalledTimes(1)
    expect(
      within(dialog).getByRole('checkbox', { name: 'Settings' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeVisible()
    await act(async () => {
      finishDownload()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('pages large collection lists while keeping choices from other pages', async () => {
    const user = userEvent.setup()
    const backup = createBackup()
    backup.data.savedTabs = PersistenceV2SnapshotSchema.parse({
      ...backup.data.savedTabs,
      collections: Array.from({ length: 45 }, (_, index) =>
        createDomainCollectionFixture(
          `collection-${index}`,
          `Domain ${index}`,
          1,
        ),
      ),
      memberships: [],
    })
    vi.mocked(exportBackupV2).mockResolvedValue(backup)
    render(<ExportBackupDialog />)
    const dialog = await openPreview(user)
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Saved tabs' }),
    )
    const collections = within(dialog).getByRole('group', {
      name: 'Domains and projects to include',
    })
    expect(within(collections).getAllByRole('checkbox')).toHaveLength(21)
    await user.click(
      within(collections).getByRole('checkbox', { name: 'Domain 0' }),
    )
    await user.click(within(collections).getByRole('button', { name: 'Next' }))
    expect(
      within(collections).queryByRole('checkbox', { name: 'Domain 0' }),
    ).toBeNull()
    await user.click(
      within(collections).getByRole('checkbox', { name: 'Domain 20' }),
    )
    await user.click(
      within(collections).getByRole('button', { name: 'Previous' }),
    )
    expect(
      within(collections).getByRole('checkbox', { name: 'Domain 0' }),
    ).not.toBeChecked()
    await user.click(
      within(dialog).getByRole('button', { name: 'Download JSON backup' }),
    )
    const payload = BackupEnvelopeV2Schema.parse(
      vi.mocked(downloadAsJson).mock.calls[0]?.[0],
    )
    expect(payload.data.savedTabs.collections).toHaveLength(43)
    expect(
      payload.data.savedTabs.collections.some(
        ({ id }) => id === 'collection-20',
      ),
    ).toBe(false)
  })
})
