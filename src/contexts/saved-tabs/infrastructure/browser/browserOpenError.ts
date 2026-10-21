import { BrowserOpenError } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'

/** Browser diagnostics can contain private URLs. Only fixed reason codes escape. */
export const classifyBrowserOpenError = (error: unknown): BrowserOpenError => {
  const message = error instanceof Error ? error.message : ''
  if (/permission|access denied|not authorized/i.test(message)) {
    return new BrowserOpenError('permission')
  }
  if (
    /illegal url|invalid url|restricted|privileged|not allowed to load|cannot load/i.test(
      message,
    )
  ) {
    return new BrowserOpenError('restrictedUrl')
  }
  if (/too many tabs|tab limit|maximum number of tabs/i.test(message)) {
    return new BrowserOpenError('tabLimit')
  }
  return new BrowserOpenError('unknown')
}
