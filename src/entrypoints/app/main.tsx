import { getPersistenceRecoveryController } from '@/app/composition/createPersistenceRecoveryController'
import { getPersistenceBootstrapRuntime } from '@/app/composition/persistenceBootstrap'
import { PersistenceRecoveryNotice } from '@/app/composition/PersistenceRecoveryNotice'
import { exportRenderRecoveryBackup } from '@/app/composition/renderRecoveryExport'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'
import { AppRouter } from '@/features/navigation/app/AppRouter'
import { mountToElement } from '@/lib/react/render-root'

// eslint-disable-next-line import/no-unassigned-import
import '@/assets/global.css'

const initializePersistence = async (): Promise<void> => {
  try {
    await getPersistenceBootstrapRuntime().bootstrap.ready()
  } catch {
    getPersistenceRecoveryController().reportUnavailable(
      'PERSISTENCE_RECOVERY_REQUIRED',
    )
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
    { onExport: exportRenderRecoveryBackup },
  )
}

document.addEventListener('DOMContentLoaded', () => {
  void initializePersistence().then(mountApp)
})

export { AppPage }
