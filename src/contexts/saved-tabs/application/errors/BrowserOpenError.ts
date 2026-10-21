export type BrowserOpenFailureReason =
  | 'permission'
  | 'restrictedUrl'
  | 'tabLimit'
  | 'unavailable'
  | 'unknown'

const messages: Record<BrowserOpenFailureReason, string> = {
  permission: 'The browser did not allow opening this URL.',
  restrictedUrl: 'The browser cannot open this restricted URL.',
  tabLimit: 'The browser cannot open additional tabs.',
  unavailable: 'The browser is unavailable.',
  unknown: 'The browser could not open this URL.',
}

/** Browser diagnostics must not become presentation text. */
export class BrowserOpenError extends Error {
  readonly reason: BrowserOpenFailureReason

  constructor(reason: BrowserOpenFailureReason) {
    super(messages[reason])
    this.name = 'BrowserOpenError'
    this.reason = reason
  }
}

export const toBrowserOpenFailureReason = (
  error: unknown,
): BrowserOpenFailureReason =>
  error instanceof BrowserOpenError ? error.reason : 'unknown'
