import {
  initializeLegacyRedirect,
  redirectToApp,
  syncDocumentTitle,
} from '@/entrypoints/shared/legacyRedirect'

initializeLegacyRedirect()

export { redirectToApp, syncDocumentTitle }
