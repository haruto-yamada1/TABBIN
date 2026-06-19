const REDACTED_URL = '[redacted-url]'
const MISSING_URL = '[missing-url]'

const redactUrlForLog = (value: unknown): string =>
  value === null || value === undefined || value === ''
    ? MISSING_URL
    : REDACTED_URL

export { redactUrlForLog }
