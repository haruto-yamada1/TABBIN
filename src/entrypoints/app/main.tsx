import { getMigrationPreflightController } from '@/app/composition/createMigrationPreflightController'
import type { MigrationPreflightControllerResult } from '@/app/composition/createMigrationPreflightController'
import { createMigrationPreflightRecoveryDiagnostic } from '@/app/composition/createMigrationPreflightRecoveryDiagnostic'
import { getPersistenceRecoveryController } from '@/app/composition/createPersistenceRecoveryController'
import { PersistenceRecoveryNotice } from '@/app/composition/PersistenceRecoveryNotice'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/features/i18n/context/I18nProvider'
import { AppRouter } from '@/features/navigation/app/AppRouter'
import { mountToElement } from '@/lib/react/render-root'

// eslint-disable-next-line import/no-unassigned-import
import '@/assets/global.css'

const reportMigrationRecoveryOutcome = (
  outcome: MigrationPreflightControllerResult,
): void => {
  const recovery = getPersistenceRecoveryController()
  switch (outcome.status) {
    case 'indexeddb': {
      return
    }
    case 'blocked':
    case 'stale': {
      recovery.reportUnavailable(
        outcome.status === 'blocked'
          ? 'PERSISTENCE_PREFLIGHT_BLOCKED'
          : 'PERSISTENCE_PREFLIGHT_STALE',
        createMigrationPreflightRecoveryDiagnostic(outcome),
      )
      return
    }
    case 'failed': {
      recovery.reportUnavailable(outcome.errorCode, outcome.diagnostic)
      return
    }
    case 'read-only-emergency': {
      recovery.reportUnavailable('PERSISTENCE_READ_ONLY')
      return
    }
    case 'not-run': {
      recovery.reportUnavailable('PERSISTENCE_PREFLIGHT_STALE')
      return
    }
    case 'cutover-pending':
    case 'legacy':
    case 'migrating':
    case 'verifying': {
      recovery.reportUnavailable('PERSISTENCE_RECOVERY_REQUIRED')
      return
    }
    default: {
      return outcome satisfies never
    }
  }
}

const runMigrationPreflight = async (): Promise<void> => {
  try {
    reportMigrationRecoveryOutcome(
      await getMigrationPreflightController().run(),
    )
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
