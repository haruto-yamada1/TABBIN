export type LinkCaptureRegistrationDeps = {
  readEnabled: () => Promise<boolean>
  hasPermissions: () => Promise<boolean>
  reconcileScript: (enabled: boolean) => Promise<void>
  updateOpenPages: (enabled: boolean) => Promise<void>
}

export const createLinkCaptureRegistration = (
  deps: LinkCaptureRegistrationDeps,
) => {
  let pending = Promise.resolve()
  const reconcile = async (): Promise<void> => {
    let enabled = false
    try {
      enabled = (await deps.readEnabled()) && (await deps.hasPermissions())
    } catch {
      // Unavailable policy never leaves a previously active page listening.
    }
    try {
      await deps.reconcileScript(enabled)
    } catch {
      enabled = false
    }
    try {
      await deps.updateOpenPages(enabled)
    } catch {
      // Closed or restricted tabs must not prevent later reconciliation.
    }
  }
  return {
    reconcile: async (): Promise<void> => {
      // oxlint-disable-next-line promise/prefer-catch -- Handle only the original promise rejection.
      pending = pending.then(reconcile, reconcile)
      return pending
    },
  }
}
