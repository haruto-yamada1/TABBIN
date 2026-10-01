const ISO_DATE_LENGTH = 10

export const exportRenderRecoveryBackup = async (): Promise<void> => {
  const [{ exportBackupV2 }, { downloadAsJson }] = await Promise.all([
    import('./optionsBackupV2Export'),
    import('@/features/options/lib/import-export'),
  ])
  const backup = await exportBackupV2()
  const date = new Date().toISOString().slice(0, ISO_DATE_LENGTH)

  await downloadAsJson(backup, `tabbin-backup-${date}.json`)
}
