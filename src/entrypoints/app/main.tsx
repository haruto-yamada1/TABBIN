import { getMigrationPreflightController } from '@/app/composition/createMigrationPreflightController'
import { PersistenceRecoveryNotice } from '@/app/composition/PersistenceRecoveryNotice'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'
import { AppRouter } from '@/features/navigation/app/AppRouter'
import { mountToElement } from '@/lib/react/render-root'

// eslint-disable-next-line import/no-unassigned-import
import '@/assets/global.css'

const runMigrationPreflight = async (): Promise<void> => {
  try {
    await getMigrationPreflightController().run()
  } catch {
    // Recovery UI owns actionable migration failures after the app mounts.
  }
}

const AppPage = () => (
  <I18nProvider>
    <TooltipProvider>
      <PersistenceRecoveryNotice />
      <AppRouter />
    </TooltipProvider>
  </I18nProvider>
)

const mountApp = (): void => {
  mountToElement(
    'app',
    <ThemeProvider defaultTheme='system' storageKey='tab-manager-theme'>
      <AppPage />
    </ThemeProvider>,
    'Failed to find the app container',
  )
}

document.addEventListener('DOMContentLoaded', () => {
  void runMigrationPreflight().then(mountApp)
})

export { AppPage }
