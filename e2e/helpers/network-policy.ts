import { getUnexpectedExtensionOutboundRequest } from '#production-network-policy'
import type { Request } from '@playwright/test'

const getRequestInitiatorUrl = (request: Request): string | null => {
  const serviceWorker = request.serviceWorker()
  if (serviceWorker !== null) {
    return serviceWorker.url()
  }
  try {
    return request.frame().url()
  } catch {
    return null
  }
}

export const getUnexpectedPlaywrightExtensionOutboundRequest = (
  request: Request,
): string | null =>
  getUnexpectedExtensionOutboundRequest({
    initiatorUrl: getRequestInitiatorUrl(request),
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url(),
  })
