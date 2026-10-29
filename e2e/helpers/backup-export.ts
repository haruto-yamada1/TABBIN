import type { Page } from '@playwright/test'

export const exportFullBackup = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /export/i }).click()
  const preview = page.getByRole('dialog', { name: 'Export Preview' })
  await preview
    .getByRole('checkbox', { name: 'Saved tabs', exact: true })
    .check()
  await preview.getByRole('checkbox', { name: 'Settings', exact: true }).check()
  await preview
    .getByRole('checkbox', { name: 'AI chat history', exact: true })
    .check()
  await preview
    .getByRole('checkbox', { name: 'Analytics views', exact: true })
    .check()
  await preview.getByRole('button', { name: 'Download JSON backup' }).click()
}
